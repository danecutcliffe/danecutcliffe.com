export const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://akofsmmsxtfqduebetga.supabase.co";
export const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
export const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
export const NOTION_TOKEN = Deno.env.get("NOTION_API_KEY") || Deno.env.get("NOTION_TOKEN") || "";
export const NOTION_VERSION = "2026-03-11";
export const JOB_CODE_PROPERTY = "Job Code";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-notion-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export type Json = Record<string, unknown> | Array<unknown> | null;

export function json(status: number, body: Json): Response {
  if (status === 204) {
    return new Response(null, { status, headers: corsHeaders });
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export function stripNotionId(value: unknown): string {
  return String(value || "").replace(/-/g, "");
}

export function extractNotionId(value: unknown): string {
  const compact = String(value || "").split("?")[0].replace(/-/g, "");
  const matches = compact.match(/[0-9a-f]{32}/gi);
  return matches ? matches[matches.length - 1] : "";
}

export function textFromRichText(items: Array<{ plain_text?: string }> = []): string {
  return items.map((item) => item.plain_text || "").join("").trim();
}

export async function notion(path: string, options: RequestInit = {}): Promise<any> {
  if (!NOTION_TOKEN) throw new Error("NOTION_API_KEY is not configured in Supabase.");
  const response = await fetch(`https://api.notion.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || `Notion request failed with ${response.status}.`);
  }
  return payload;
}

export async function supabase(path: string, options: RequestInit = {}): Promise<any> {
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured in Supabase.");
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
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

export async function supabaseAsUser(path: string, accessToken: string, options: RequestInit = {}): Promise<any> {
  if (!SUPABASE_ANON_KEY) throw new Error("SUPABASE_ANON_KEY is not configured in Supabase.");
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(payload?.message || payload?.hint || text || `Supabase request failed with ${response.status}.`);
  }
  return payload;
}

export async function requireAdmin(accessToken: string): Promise<void> {
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured in Supabase.");
  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const user = await userResponse.json().catch(() => null);
  if (!userResponse.ok || !user?.id) {
    throw new Error("Sign in as an admin before syncing scopes.");
  }

  const profiles = await supabase(`/rest/v1/profiles?select=id,role,is_active&id=eq.${encodeURIComponent(user.id)}&limit=1`);
  const profile = profiles?.[0];
  if (!profile?.is_active || profile.role !== "admin") {
    throw new Error("Admin access is required to sync scopes.");
  }
}

export async function resolveDataSource(databaseUrl: string, providedDataSourceId?: string): Promise<{
  databaseId: string;
  dataSourceId: string;
  title: string;
}> {
  const databaseId = extractNotionId(databaseUrl);
  if (!databaseId) throw new Error("Paste a valid Notion database URL.");

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
    if (!dataSource?.id) throw new Error("No data source was found under that Notion database.");
    return {
      databaseId,
      dataSourceId: dataSource.id,
      title: textFromRichText(database.title) || dataSource.name || "Notion scope database",
    };
  } catch {
    const source = await notion(`/data_sources/${encodeURIComponent(databaseId)}`);
    return {
      databaseId,
      dataSourceId: source.id,
      title: source.name || "Notion scope database",
    };
  }
}

export async function queryAllPages(dataSourceId: string): Promise<any[]> {
  const pages = [];
  let startCursor: string | null = null;
  do {
    const body: Record<string, unknown> = { page_size: 100, result_type: "page" };
    if (startCursor) body.start_cursor = startCursor;
    const response = await notion(`/data_sources/${encodeURIComponent(dataSourceId)}/query`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    pages.push(...(response.results || []).filter((item: any) => item.object === "page"));
    startCursor = response.has_more ? response.next_cursor : null;
  } while (startCursor);
  return pages;
}

async function queryBlockChildren(parentId: string): Promise<any[]> {
  const blocks = [];
  let startCursor: string | null = null;
  do {
    const query = startCursor ? `?start_cursor=${encodeURIComponent(startCursor)}&page_size=100` : "?page_size=100";
    const response = await notion(`/blocks/${encodeURIComponent(parentId)}/children${query}`);
    blocks.push(...(response.results || []));
    startCursor = response.has_more ? response.next_cursor : null;
  } while (startCursor);
  return blocks;
}

export function pageTitle(page: any): string {
  const titleProperty = Object.values(page.properties || {}).find((property: any) => property.type === "title") as any;
  return textFromRichText(titleProperty?.title || []) || "Untitled scope";
}

export function propertyText(property: any): string {
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
      return (property.multi_select || []).map((item: any) => item.name).join(", ");
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

function blockText(block: any): string {
  const payload = block[block.type];
  if (!payload) return "";
  return textFromRichText(payload.rich_text || []);
}

export type NotionScopeItem = {
  blockId: string;
  parentBlockId: string | null;
  section: string;
  itemText: string;
  checked: boolean | null;
  sortOrder: number;
};

export async function pageBlocksToItems(pageId: string): Promise<NotionScopeItem[]> {
  const items: NotionScopeItem[] = [];
  let sortOrder = 10;

  async function walk(parentId: string, section: string, sectionBlockId: string | null): Promise<void> {
    const blocks = await queryBlockChildren(parentId);
    for (const block of blocks) {
      if (["heading_1", "heading_2", "heading_3"].includes(block.type)) {
        const heading = blockText(block);
        if (block.has_children) {
          await walk(block.id, heading || section, block.id);
        }
        continue;
      }

      if (block.type === "toggle") {
        const heading = blockText(block);
        if (block.has_children) {
          await walk(block.id, heading || section, block.id);
        }
        continue;
      }

      if (["to_do", "bulleted_list_item", "numbered_list_item", "paragraph"].includes(block.type)) {
        const itemText = blockText(block);
        if (itemText) {
          items.push({
            blockId: block.id,
            parentBlockId: sectionBlockId,
            section,
            itemText,
            checked: block.type === "to_do" ? Boolean(block.to_do?.checked) : null,
            sortOrder,
          });
          sortOrder += 10;
        }
      }

      if (block.has_children) {
        await walk(block.id, section, sectionBlockId);
      }
    }
  }

  await walk(pageId, "Scope", null);
  return items;
}

async function upsertMapping(jobSiteId: string, database: { databaseId: string; dataSourceId: string; title: string }, databaseUrl: string): Promise<any> {
  const rows = await supabase("/rest/v1/scope_notion_databases?on_conflict=job_site_id&select=*", {
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

async function saveProject(project: Record<string, unknown>): Promise<any> {
  const pageId = String(project.notion_page_id || "");
  const existing = await supabase(`/rest/v1/scope_projects?select=id&notion_page_id=eq.${encodeURIComponent(pageId)}&limit=1`);
  if (existing[0]?.id) {
    const rows = await supabase(`/rest/v1/scope_projects?id=eq.${encodeURIComponent(existing[0].id)}&select=*`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(project),
    });
    return rows[0];
  }

  const rows = await supabase("/rest/v1/scope_projects?select=*", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([project]),
  });
  return rows[0];
}

async function syncItems(projectId: string, notionItems: NotionScopeItem[]): Promise<{ inserted: number; updated: number; deactivated: number }> {
  const existing = await supabase(`/rest/v1/scope_items?select=*&scope_project_id=eq.${encodeURIComponent(projectId)}`);
  const byBlock = new Map(existing.filter((item: any) => item.notion_block_id).map((item: any) => [stripNotionId(item.notion_block_id), item]));
  const byText = new Map(existing.map((item: any) => [`${item.section}\n${item.item_text}`, item]));
  const seenIds = new Set<string>();
  let inserted = 0;
  let updated = 0;
  const now = new Date().toISOString();

  for (const item of notionItems) {
    const blockKey = stripNotionId(item.blockId);
    const textKey = `${item.section}\n${item.itemText}`;
    const current = byBlock.get(blockKey) || byText.get(textKey);
    const payload: Record<string, unknown> = {
      scope_project_id: projectId,
      section: item.section,
      item_text: item.itemText,
      sort_order: item.sortOrder,
      source: current?.source || "notion",
      notion_block_id: item.blockId,
      notion_parent_block_id: item.parentBlockId,
      notion_checked: item.checked === true,
      is_active: true,
      sync_status: "notion-synced",
      last_pulled_from_notion_at: now,
    };

    if (item.checked !== null) {
      payload.completed_at = item.checked ? (current?.completed_at || now) : null;
      payload.completed_by = item.checked ? (current?.completed_by || null) : null;
    }

    if (current?.id) {
      await supabase(`/rest/v1/scope_items?id=eq.${encodeURIComponent(current.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(payload),
      });
      seenIds.add(current.id);
      updated += 1;
    } else {
      const rows = await supabase("/rest/v1/scope_items?select=id", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify([payload]),
      });
      if (rows[0]?.id) seenIds.add(rows[0].id);
      inserted += 1;
    }
  }

  const stale = existing.filter((item: any) => (
    item.source === "notion" &&
    item.notion_block_id &&
    !seenIds.has(item.id)
  ));
  for (const item of stale) {
    await supabase(`/rest/v1/scope_items?id=eq.${encodeURIComponent(item.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ is_active: false, sync_status: "notion-missing", last_pulled_from_notion_at: now }),
    });
  }

  return { inserted, updated, deactivated: stale.length };
}

export async function syncPage(page: any, mapping?: any): Promise<any | null> {
  const pageId = stripNotionId(page.id);
  const existingProjects = await supabase(`/rest/v1/scope_projects?select=*&notion_page_id=eq.${encodeURIComponent(pageId)}&limit=1`);
  const existingProject = existingProjects[0] || null;

  let activeMapping = mapping || null;
  const pageDataSourceId = page.parent?.data_source_id || page.parent?.database_id || page.data?.parent?.data_source_id;
  if (!activeMapping && pageDataSourceId) {
    const mappings = await supabase(`/rest/v1/scope_notion_databases?select=*&or=(notion_data_source_id.eq.${encodeURIComponent(pageDataSourceId)},notion_database_id.eq.${encodeURIComponent(stripNotionId(pageDataSourceId))})&limit=1`);
    activeMapping = mappings[0] || null;
  }
  if (!activeMapping && existingProject?.scope_notion_database_id) {
    const mappings = await supabase(`/rest/v1/scope_notion_databases?select=*&id=eq.${encodeURIComponent(existingProject.scope_notion_database_id)}&limit=1`);
    activeMapping = mappings[0] || null;
  }
  if (!activeMapping && !existingProject) return null;

  const title = pageTitle(page);
  const rawJobCode = propertyText(page.properties?.[JOB_CODE_PROPERTY]).trim();
  let jobCode = null;
  let site = null;

  if (activeMapping?.job_site_id) {
    const sites = await supabase(`/rest/v1/job_sites?select=id,name&id=eq.${encodeURIComponent(activeMapping.job_site_id)}&limit=1`);
    site = sites[0] || null;
    if (rawJobCode) {
      const jobCodes = await supabase(`/rest/v1/job_codes?select=id,job_site_id,code,name&job_site_id=eq.${encodeURIComponent(activeMapping.job_site_id)}&code=ilike.${encodeURIComponent(rawJobCode)}&limit=1`);
      jobCode = jobCodes[0] || null;
    }
  }

  const project = await saveProject({
    notion_page_id: pageId,
    notion_url: page.url,
    title,
    property_name: site?.name || existingProject?.property_name || "Notion scope",
    unit_name: title,
    job_site_id: activeMapping?.job_site_id || existingProject?.job_site_id || null,
    job_code_id: jobCode?.id || existingProject?.job_code_id || null,
    scope_notion_database_id: activeMapping?.id || existingProject?.scope_notion_database_id || null,
    notion_data_source_id: activeMapping?.notion_data_source_id || pageDataSourceId || existingProject?.notion_data_source_id || null,
    notion_title_property_name: "Name",
    notion_job_code_property_name: JOB_CODE_PROPERTY,
    sync_status: jobCode || existingProject?.job_code_id ? "notion-synced" : "notion-unmatched-job-code",
    is_active: true,
    source_synced_at: new Date().toISOString(),
    last_pulled_from_notion_at: new Date().toISOString(),
  });

  const items = await pageBlocksToItems(page.id);
  const summary = await syncItems(project.id, items);
  return { project, rawJobCode, jobCode, itemSummary: summary };
}

export async function syncDatabase(jobSiteId: string, notionDatabaseUrl: string, providedDataSourceId?: string): Promise<any> {
  const [site] = await supabase(`/rest/v1/job_sites?select=id,name&id=eq.${encodeURIComponent(jobSiteId)}&limit=1`);
  if (!site) throw new Error("Property not found.");

  const jobCodes = await supabase(`/rest/v1/job_codes?select=id,job_site_id,code,name&job_site_id=eq.${encodeURIComponent(jobSiteId)}`);
  const jobCodeByCode = new Map(
    jobCodes
      .filter((code: any) => code.code)
      .map((code: any) => [String(code.code).trim().toUpperCase(), code]),
  );

  const database = await resolveDataSource(notionDatabaseUrl, providedDataSourceId);
  const mapping = await upsertMapping(jobSiteId, database, notionDatabaseUrl);
  const pages = await queryAllPages(database.dataSourceId);

  const matched = [];
  const unmatchedNotion = [];
  const usedJobCodeIds = new Set<string>();

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

    const result = await syncPage(page, mapping);
    matched.push({
      pageId: page.id,
      title,
      jobCode: rawJobCode,
      jobCodeName: jobCode.name,
      projectId: result?.project?.id,
      insertedItems: result?.itemSummary?.inserted || 0,
      updatedItems: result?.itemSummary?.updated || 0,
    });
  }

  const unmatchedJobCodes = jobCodes
    .filter((code: any) => code.code && !usedJobCodeIds.has(code.id))
    .map((code: any) => ({ code: code.code, name: code.name }));

  return {
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
  };
}

export async function syncDatabaseMapping(mapping: any): Promise<any> {
  if (!mapping?.job_site_id || !mapping?.notion_database_url) return null;
  return syncDatabase(mapping.job_site_id, mapping.notion_database_url, mapping.notion_data_source_id);
}

export async function pushItemToggleToNotion(item: any, completed: boolean): Promise<boolean> {
  if (!item?.notion_block_id) return false;
  try {
    await notion(`/blocks/${encodeURIComponent(item.notion_block_id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        to_do: { checked: completed },
      }),
    });
    await supabase(`/rest/v1/scope_items?id=eq.${encodeURIComponent(item.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        notion_checked: completed,
        last_pushed_to_notion_at: new Date().toISOString(),
        sync_status: "notion-pushed",
      }),
    });
    return true;
  } catch (error) {
    await supabase(`/rest/v1/scope_items?id=eq.${encodeURIComponent(item.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ sync_status: error instanceof Error ? `notion-push-failed: ${error.message}` : "notion-push-failed" }),
    });
    return false;
  }
}

export async function pushNewItemToNotion(item: any): Promise<boolean> {
  const projects = await supabase(`/rest/v1/scope_projects?select=*&id=eq.${encodeURIComponent(item.scope_project_id)}&limit=1`);
  const project = projects[0];
  if (!project?.notion_page_id) return false;

  const siblings = await supabase(`/rest/v1/scope_items?select=notion_parent_block_id&scope_project_id=eq.${encodeURIComponent(item.scope_project_id)}&section=eq.${encodeURIComponent(item.section)}&notion_parent_block_id=not.is.null&limit=1`);
  const parentBlockId = siblings[0]?.notion_parent_block_id || project.notion_page_id;
  const response = await notion(`/blocks/${encodeURIComponent(parentBlockId)}/children`, {
    method: "PATCH",
    body: JSON.stringify({
      children: [{
        object: "block",
        type: "to_do",
        to_do: {
          rich_text: [{ type: "text", text: { content: item.item_text } }],
          checked: false,
        },
      }],
    }),
  });
  const block = response.results?.[0];
  if (!block?.id) return false;
  await supabase(`/rest/v1/scope_items?id=eq.${encodeURIComponent(item.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      notion_block_id: block.id,
      notion_parent_block_id: parentBlockId === project.notion_page_id ? null : parentBlockId,
      notion_checked: false,
      last_pushed_to_notion_at: new Date().toISOString(),
      sync_status: "notion-pushed",
    }),
  });
  return true;
}
