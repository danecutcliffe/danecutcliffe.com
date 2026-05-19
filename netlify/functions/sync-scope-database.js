const SUPABASE_URL = process.env.SUPABASE_URL || "https://akofsmmsxtfqduebetga.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_5IC3CkcNPr9-XrMBymBcoQ_XrL66k4y";
const NOTION_TOKEN = process.env.NOTION_API_KEY || process.env.NOTION_TOKEN;
const NOTION_VERSION = "2026-03-11";
const JOB_CODE_PROPERTY = "Job Code";

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  },
  body: JSON.stringify(body),
});

const textFromRichText = (items = []) => items.map((item) => item.plain_text || "").join("").trim();

const extractNotionId = (value) => {
  const compact = String(value || "").split("?")[0].replace(/-/g, "");
  const matches = compact.match(/[0-9a-f]{32}/gi);
  return matches ? matches[matches.length - 1] : "";
};

const notionHeaders = () => ({
  Authorization: `Bearer ${NOTION_TOKEN}`,
  "Notion-Version": NOTION_VERSION,
  "Content-Type": "application/json",
});

async function notion(path, options = {}) {
  const response = await fetch(`https://api.notion.com/v1${path}`, {
    ...options,
    headers: notionHeaders(),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || `Notion request failed with ${response.status}.`);
  }
  return payload;
}

async function supabase(path, accessToken, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(payload?.message || payload?.hint || `Supabase request failed with ${response.status}.`);
  }
  return payload;
}

async function requireAdmin(accessToken) {
  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const user = await userResponse.json().catch(() => null);
  if (!userResponse.ok || !user?.id) {
    throw new Error("Sign in as an admin before syncing scopes.");
  }

  const profiles = await supabase(`/rest/v1/profiles?select=id,role,is_active&id=eq.${encodeURIComponent(user.id)}&limit=1`, accessToken);
  const profile = profiles?.[0];
  if (!profile?.is_active || profile.role !== "admin") {
    throw new Error("Admin access is required to sync scopes.");
  }
  return profile;
}

async function resolveDataSource(databaseUrl, providedDataSourceId) {
  const databaseId = extractNotionId(databaseUrl);
  if (!databaseId) {
    throw new Error("Paste a valid Notion database URL.");
  }

  if (providedDataSourceId) {
    const source = await notion(`/data_sources/${encodeURIComponent(providedDataSourceId)}`);
    return {
      databaseId,
      dataSourceId: source.id,
      title: source.name || "Notion scope database",
    };
  }

  try {
    const database = await notion(`/databases/${encodeURIComponent(databaseId)}`);
    const dataSource = database.data_sources?.[0];
    if (!dataSource?.id) {
      throw new Error("No data source was found under that Notion database.");
    }
    return {
      databaseId,
      dataSourceId: dataSource.id,
      title: textFromRichText(database.title) || dataSource.name || "Notion scope database",
    };
  } catch (error) {
    const source = await notion(`/data_sources/${encodeURIComponent(databaseId)}`);
    return {
      databaseId,
      dataSourceId: source.id,
      title: source.name || "Notion scope database",
      warning: error.message,
    };
  }
}

async function queryAllPages(dataSourceId) {
  const pages = [];
  let startCursor = null;
  do {
    const body = { page_size: 100, result_type: "page" };
    if (startCursor) body.start_cursor = startCursor;
    const response = await notion(`/data_sources/${encodeURIComponent(dataSourceId)}/query`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    pages.push(...(response.results || []).filter((item) => item.object === "page"));
    startCursor = response.has_more ? response.next_cursor : null;
  } while (startCursor);
  return pages;
}

async function queryPageBlocks(pageId) {
  const blocks = [];
  let startCursor = null;
  do {
    const query = startCursor ? `?start_cursor=${encodeURIComponent(startCursor)}&page_size=100` : "?page_size=100";
    const response = await notion(`/blocks/${encodeURIComponent(pageId)}/children${query}`);
    blocks.push(...(response.results || []));
    startCursor = response.has_more ? response.next_cursor : null;
  } while (startCursor);
  return blocks;
}

function pageTitle(page) {
  const titleProperty = Object.values(page.properties || {}).find((property) => property.type === "title");
  return textFromRichText(titleProperty?.title || []) || "Untitled scope";
}

function propertyText(property) {
  if (!property) return "";
  switch (property.type) {
    case "title":
      return textFromRichText(property.title);
    case "rich_text":
      return textFromRichText(property.rich_text);
    case "select":
      return property.select?.name || "";
    case "status":
      return property.status?.name || "";
    case "multi_select":
      return (property.multi_select || []).map((item) => item.name).join(", ");
    case "number":
      return property.number == null ? "" : String(property.number);
    case "formula":
      if (!property.formula) return "";
      if (property.formula.type === "string") return property.formula.string || "";
      if (property.formula.type === "number") return property.formula.number == null ? "" : String(property.formula.number);
      if (property.formula.type === "boolean") return property.formula.boolean ? "true" : "false";
      if (property.formula.type === "date") return property.formula.date?.start || "";
      return "";
    default:
      return "";
  }
}

function blockText(block) {
  const payload = block[block.type];
  if (!payload) return "";
  return textFromRichText(payload.rich_text || []);
}

function blocksToItems(blocks) {
  const items = [];
  let section = "Scope";
  blocks.forEach((block) => {
    if (["heading_1", "heading_2", "heading_3"].includes(block.type)) {
      const heading = blockText(block);
      if (heading) section = heading;
      return;
    }

    if (!["to_do", "bulleted_list_item", "numbered_list_item", "paragraph", "toggle"].includes(block.type)) return;
    const itemText = blockText(block);
    if (!itemText) return;
    items.push({
      section,
      itemText,
      checked: Boolean(block.type === "to_do" && block.to_do?.checked),
    });
  });
  return items;
}

async function upsertMapping(accessToken, jobSiteId, database, databaseUrl) {
  const rows = await supabase("/rest/v1/scope_notion_databases?on_conflict=job_site_id&select=*", accessToken, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify([{
      job_site_id: jobSiteId,
      notion_database_id: database.databaseId,
      notion_database_url: databaseUrl,
      notion_data_source_id: database.dataSourceId,
      title: database.title,
      job_code_property_name: JOB_CODE_PROPERTY,
      is_active: true,
      last_synced_at: new Date().toISOString(),
      last_sync_status: "synced",
    }]),
  });
  return rows[0];
}

async function upsertProject(accessToken, project) {
  const rows = await supabase("/rest/v1/scope_projects?on_conflict=notion_page_id,unit_name&select=*", accessToken, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify([project]),
  });
  return rows[0];
}

async function insertMissingItems(accessToken, projectId, notionItems) {
  if (notionItems.length === 0) return { inserted: 0, existing: 0 };
  const existing = await supabase(`/rest/v1/scope_items?select=section,item_text&scope_project_id=eq.${encodeURIComponent(projectId)}`, accessToken);
  const existingKeys = new Set(existing.map((item) => `${item.section}\n${item.item_text}`));
  const rows = notionItems
    .filter((item) => !existingKeys.has(`${item.section}\n${item.itemText}`))
    .map((item, index) => ({
      scope_project_id: projectId,
      section: item.section,
      item_text: item.itemText,
      sort_order: (existing.length + index + 1) * 10,
      source: "notion",
      is_active: true,
    }));

  if (rows.length === 0) return { inserted: 0, existing: existing.length };
  await supabase("/rest/v1/scope_items", accessToken, {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(rows),
  });
  return { inserted: rows.length, existing: existing.length };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });

  try {
    if (!NOTION_TOKEN) {
      return json(500, { error: "NOTION_API_KEY is not configured in Netlify." });
    }

    const accessToken = event.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!accessToken) {
      return json(401, { error: "Sign in as an admin before syncing scopes." });
    }
    await requireAdmin(accessToken);

    const body = JSON.parse(event.body || "{}");
    const jobSiteId = body.jobSiteId;
    const notionDatabaseUrl = body.notionDatabaseUrl;
    if (!jobSiteId || !notionDatabaseUrl) {
      return json(400, { error: "Property and Notion database URL are required." });
    }

    const [site] = await supabase(`/rest/v1/job_sites?select=id,name&id=eq.${encodeURIComponent(jobSiteId)}&limit=1`, accessToken);
    if (!site) return json(404, { error: "Property not found." });

    const jobCodes = await supabase(`/rest/v1/job_codes?select=id,job_site_id,code,name&job_site_id=eq.${encodeURIComponent(jobSiteId)}`, accessToken);
    const jobCodeByCode = new Map(
      jobCodes
        .filter((code) => code.code)
        .map((code) => [String(code.code).trim().toUpperCase(), code])
    );

    const database = await resolveDataSource(notionDatabaseUrl, body.notionDataSourceId);
    const mapping = await upsertMapping(accessToken, jobSiteId, database, notionDatabaseUrl);
    const pages = await queryAllPages(database.dataSourceId);

    const matched = [];
    const unmatchedNotion = [];
    const usedJobCodeIds = new Set();

    for (const page of pages) {
      const rawJobCode = propertyText(page.properties?.[JOB_CODE_PROPERTY]).trim();
      const title = pageTitle(page);
      if (!rawJobCode) {
        unmatchedNotion.push({ title, reason: `Missing ${JOB_CODE_PROPERTY}` });
        continue;
      }

      const jobCode = jobCodeByCode.get(rawJobCode.toUpperCase());
      if (!jobCode) {
        unmatchedNotion.push({ title, jobCode: rawJobCode, reason: "No matching Time app job code" });
        continue;
      }
      usedJobCodeIds.add(jobCode.id);

      const project = await upsertProject(accessToken, {
        notion_page_id: page.id.replace(/-/g, ""),
        notion_url: page.url,
        title,
        property_name: site.name,
        unit_name: title,
        job_site_id: jobSiteId,
        job_code_id: jobCode.id,
        scope_notion_database_id: mapping.id,
        notion_data_source_id: database.dataSourceId,
        notion_title_property_name: "Name",
        notion_job_code_property_name: JOB_CODE_PROPERTY,
        sync_status: "notion-synced",
        is_active: true,
        source_synced_at: new Date().toISOString(),
        last_pulled_from_notion_at: new Date().toISOString(),
      });

      const blocks = await queryPageBlocks(page.id);
      const itemSummary = await insertMissingItems(accessToken, project.id, blocksToItems(blocks));
      matched.push({
        pageId: page.id,
        title,
        jobCode: rawJobCode,
        jobCodeName: jobCode.name,
        projectId: project.id,
        insertedItems: itemSummary.inserted,
      });
    }

    const unmatchedJobCodes = jobCodes
      .filter((code) => code.code && !usedJobCodeIds.has(code.id))
      .map((code) => ({ code: code.code, name: code.name }));

    return json(200, {
      mapping,
      database: {
        id: database.databaseId,
        dataSourceId: database.dataSourceId,
        title: database.title,
      },
      summary: {
        notionPages: pages.length,
        matched: matched.length,
        unmatchedNotion: unmatchedNotion.length,
        unmatchedJobCodes: unmatchedJobCodes.length,
      },
      matched,
      unmatchedNotion,
      unmatchedJobCodes,
    });
  } catch (error) {
    return json(500, { error: error.message || "Scope sync failed." });
  }
};
