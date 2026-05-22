import {
  backfillProjectItemsToNotion,
  json,
  requireAdmin,
  syncDatabase,
} from "../_shared/scope-sync.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json(204, null);
  if (request.method !== "POST") return json(405, { error: "Method not allowed." });

  try {
    const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!accessToken) return json(401, { error: "Sign in as an admin before syncing scopes." });
    await requireAdmin(accessToken);

    const body = await request.json().catch(() => ({}));
    if (body.action === "repair-orphans") {
      const scopeProjectId = String(body.scopeProjectId || "");
      if (!scopeProjectId) {
        return json(400, { error: "Scope project is required." });
      }

      const result = await backfillProjectItemsToNotion(scopeProjectId);
      return json(200, result);
    }

    const jobSiteId = body.jobSiteId;
    const notionDatabaseUrl = body.notionDatabaseUrl;
    if (!jobSiteId || !notionDatabaseUrl) {
      return json(400, { error: "Property and Notion database URL are required." });
    }

    const result = await syncDatabase(jobSiteId, notionDatabaseUrl, body.notionDataSourceId);
    return json(200, result);
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : "Scope sync failed." });
  }
});
