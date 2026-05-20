import {
  json,
  notion,
  stripNotionId,
  supabase,
  syncDatabaseMapping,
  syncPage,
} from "../_shared/scope-sync.ts";

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

async function latestVerificationToken(): Promise<string> {
  const configured = Deno.env.get("NOTION_WEBHOOK_VERIFICATION_TOKEN");
  if (configured) return configured;
  const rows = await supabase("/rest/v1/scope_notion_webhook_events?select=verification_token&verification_token=not.is.null&order=received_at.desc&limit=1");
  return rows[0]?.verification_token || "";
}

async function verifySignature(rawBody: string, request: Request): Promise<void> {
  const token = await latestVerificationToken();
  if (!token) throw new Error("Notion webhook verification token has not been captured yet.");

  const header = request.headers.get("x-notion-signature") || "";
  if (!header.startsWith("sha256=")) throw new Error("Missing Notion webhook signature.");

  const expected = `sha256=${await hmacSha256Hex(token, rawBody)}`;
  if (!timingSafeEqual(expected, header)) throw new Error("Invalid Notion webhook signature.");
}

async function logEvent(payload: any, status = "received", message = ""): Promise<any> {
  const row = {
    notion_event_id: payload.id || null,
    event_type: payload.verification_token ? "verification" : (payload.type || "unknown"),
    entity_type: payload.entity?.type || null,
    entity_id: payload.entity?.id ? stripNotionId(payload.entity.id) : null,
    notion_database_id: payload.entity?.type === "database" ? stripNotionId(payload.entity.id) : null,
    notion_data_source_id: payload.entity?.type === "data_source" ? payload.entity.id : payload.data?.parent?.data_source_id || null,
    status,
    message,
    verification_token: payload.verification_token || null,
    payload,
    processed_at: status === "processed" || status === "ignored" ? new Date().toISOString() : null,
  };
  const rows = await supabase("/rest/v1/scope_notion_webhook_events?select=*", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([row]),
  });
  return rows[0];
}

async function updateLog(id: string, status: string, message: string): Promise<void> {
  await supabase(`/rest/v1/scope_notion_webhook_events?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      status,
      message,
      processed_at: new Date().toISOString(),
    }),
  });
}

async function alreadyProcessed(eventId: string): Promise<boolean> {
  if (!eventId) return false;
  const rows = await supabase(`/rest/v1/scope_notion_webhook_events?select=id,status&notion_event_id=eq.${encodeURIComponent(eventId)}&status=eq.processed&limit=1`);
  return Boolean(rows[0]);
}

async function mappingsForDataSource(dataSourceId: string): Promise<any[]> {
  return supabase(`/rest/v1/scope_notion_databases?select=*&notion_data_source_id=eq.${encodeURIComponent(dataSourceId)}&is_active=eq.true`);
}

async function mappingsForDatabase(databaseId: string): Promise<any[]> {
  return supabase(`/rest/v1/scope_notion_databases?select=*&notion_database_id=eq.${encodeURIComponent(stripNotionId(databaseId))}&is_active=eq.true`);
}

async function processWebhook(payload: any): Promise<string> {
  const type = payload.type || "";
  const entity = payload.entity || {};
  const entityId = entity.id;
  if (!type || !entityId) return "Webhook had no processable entity.";

  if (type.startsWith("page.")) {
    const page = await notion(`/pages/${encodeURIComponent(entityId)}`);
    const result = await syncPage(page);
    return result
      ? `Synced page ${result.project?.unit_name || result.project?.title || stripNotionId(entityId)}.`
      : `Ignored page ${stripNotionId(entityId)} because it is not linked to a Time app scope.`;
  }

  if (type.startsWith("data_source.")) {
    const mappings = await mappingsForDataSource(entityId);
    const results = [];
    for (const mapping of mappings) {
      results.push(await syncDatabaseMapping(mapping));
    }
    return mappings.length
      ? `Synced ${mappings.length} mapped data source${mappings.length === 1 ? "" : "s"}.`
      : `Ignored data source ${stripNotionId(entityId)} because it is not mapped to a Time app property.`;
  }

  if (type.startsWith("database.")) {
    const mappings = await mappingsForDatabase(entityId);
    const results = [];
    for (const mapping of mappings) {
      results.push(await syncDatabaseMapping(mapping));
    }
    return mappings.length
      ? `Synced ${mappings.length} mapped database${mappings.length === 1 ? "" : "s"}.`
      : `Ignored database ${stripNotionId(entityId)} because it is not mapped to a Time app property.`;
  }

  return `Ignored unsupported event type ${type}.`;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json(204, null);
  if (request.method !== "POST") return json(405, { error: "Method not allowed." });

  let eventRow: any = null;
  try {
    const rawBody = await request.text();
    const payload = JSON.parse(rawBody || "{}");

    if (payload.verification_token) {
      eventRow = await logEvent(payload, "verification_received", "Paste this verification token into Notion to activate the webhook subscription.");
      return json(200, { ok: true, eventId: eventRow.id });
    }

    if (payload.id && await alreadyProcessed(payload.id)) {
      return json(200, { ok: true, duplicate: true });
    }

    await verifySignature(rawBody, request);
    eventRow = await logEvent(payload);
    const message = await processWebhook(payload);
    await updateLog(eventRow.id, message.startsWith("Ignored") ? "ignored" : "processed", message);
    return json(200, { ok: true, message });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Notion webhook sync failed.";
    if (eventRow?.id) {
      await updateLog(eventRow.id, "failed", message).catch(() => {});
    }
    return json(500, { error: message });
  }
});
