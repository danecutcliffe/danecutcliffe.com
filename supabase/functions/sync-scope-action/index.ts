import {
  json,
  pushItemToggleToNotion,
  pushNewItemToNotion,
  syncSectionOrderToNotion,
  supabase,
  supabaseAsUser,
} from "../_shared/scope-sync.ts";

const edgeRuntime = (globalThis as Record<string, any>).EdgeRuntime;
const waitUntil = edgeRuntime && typeof edgeRuntime.waitUntil === "function"
  ? edgeRuntime.waitUntil.bind(edgeRuntime)
  : null;

async function readItem(itemId: string): Promise<any> {
  const rows = await supabase(`/rest/v1/scope_items?select=*&id=eq.${encodeURIComponent(itemId)}&limit=1`);
  return rows[0] || null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json(204, null);
  if (request.method !== "POST") return json(405, { error: "Method not allowed." });

  try {
    const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!accessToken) return json(401, { error: "Sign in before updating scope items." });

    const body = await request.json().catch(() => ({}));
    if (body.action === "toggle") {
      const itemId = String(body.itemId || "");
      const completed = Boolean(body.completed);
      if (!itemId) return json(400, { error: "Scope item is required." });

      const rows = await supabaseAsUser("/rest/v1/rpc/scope_toggle_item", accessToken, {
        method: "POST",
        body: JSON.stringify({ p_item_id: itemId, p_completed: completed }),
      });
      const item = rows || await readItem(itemId);
      const pushedToNotion = await pushItemToggleToNotion(item, completed);
      return json(200, { item, pushedToNotion });
    }

    if (body.action === "add") {
      const scopeProjectId = String(body.scopeProjectId || "");
      const section = String(body.section || "");
      const itemText = String(body.itemText || "");
      if (!scopeProjectId || !itemText.trim()) return json(400, { error: "Scope project and item text are required." });

      const item = await supabaseAsUser("/rest/v1/rpc/scope_add_item", accessToken, {
        method: "POST",
        body: JSON.stringify({
          p_scope_project_id: scopeProjectId,
          p_section: section,
          p_item_text: itemText,
        }),
      });
      const pushedToNotion = await pushNewItemToNotion(item);
      return json(200, { item, pushedToNotion });
    }

    if (body.action === "reorder") {
      const scopeProjectId = String(body.scopeProjectId || "");
      const section = String(body.section || "");
      const itemIds = Array.isArray(body.itemIds) ? body.itemIds.map((value) => String(value || "")).filter(Boolean) : [];
      if (!scopeProjectId || !section || !itemIds.length) {
        return json(400, { error: "Scope project, section, and reordered items are required." });
      }

      const items = await supabaseAsUser("/rest/v1/rpc/scope_reorder_items", accessToken, {
        method: "POST",
        body: JSON.stringify({
          p_scope_project_id: scopeProjectId,
          p_section: section,
          p_item_ids: itemIds,
        }),
      });

      if (waitUntil) {
        waitUntil((async () => {
          try {
            await syncSectionOrderToNotion(scopeProjectId, section);
          } catch (error) {
            console.error("Background Notion reorder sync failed", error);
          }
        })());
        return json(200, {
          items,
          pushedToNotion: false,
          notionSyncQueued: true,
        });
      }

      let pushedToNotion = false;
      let notionSyncError = "";
      try {
        pushedToNotion = await syncSectionOrderToNotion(scopeProjectId, section);
      } catch (error) {
        notionSyncError = error instanceof Error ? error.message : "Notion sync failed.";
      }
      return json(200, { items, pushedToNotion, notionSyncError });
    }

    return json(400, { error: "Unknown scope action." });
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : "Scope action failed." });
  }
});
