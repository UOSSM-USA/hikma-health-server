import type { Context, Next } from "hono";

type client_status = "Active" | "Paused" | "Inactive" | "Blocked";

export type client = {
  key: string;
  name: string;
  status: client_status;
  exempt_ai_api_key: boolean;
  created_at: Date;
  updated_at: Date;
};

type client_json = Omit<client, "created_at" | "updated_at"> & {
  created_at: string;
  updated_at: string;
};

function load_clients(): client[] {
  // The full registry is provided as a JSON array string in CLIENTS_LIST.
  // This loads identically in dev (via .env) and prod (real env var) and
  // keeps client API keys out of the repo.
  const raw_json = process.env["CLIENTS_LIST"];

  if (!raw_json) {
    console.warn("[clients] WARNING: CLIENTS_LIST env var not set — no clients registered");
    return [];
  }

  let raw: client_json[];
  try {
    raw = JSON.parse(raw_json);
  } catch (err) {
    console.warn(`[clients] WARNING: CLIENTS_LIST is not valid JSON — no clients registered (${err})`);
    return [];
  }

  if (!Array.isArray(raw)) {
    console.warn("[clients] WARNING: CLIENTS_LIST must be a JSON array — no clients registered");
    return [];
  }

  return raw.map((c) => ({
    ...c,
    created_at: new Date(c.created_at),
    updated_at: new Date(c.updated_at),
  }));
}

const clients: client[] = load_clients();

function find_client(api_key: string): client | undefined {
  return clients.find((c) => c.key === api_key);
}

/** Hono middleware that validates the x-api-key header against the client registry. */
export async function auth_middleware(c: Context, next: Next) {
  const api_key = c.req.header("x-api-key");

  if (!api_key) {
    return c.json({ error: "Missing x-api-key header" }, 401);
  }

  const client = find_client(api_key);

  if (!client) {
    return c.json({ error: "Invalid API key" }, 401);
  }

  if (client.status !== "Active") {
    return c.json(
      { error: `Client "${client.name}" is ${client.status.toLowerCase()}` },
      403,
    );
  }

  c.set("client", client);
  await next();
}

/** Resolves the Anthropic API key based on the client's exempt_ai_api_key flag.
 *  - exempt=true: always use our server key, ignore whatever the client sends
 *  - exempt=false: client must provide their own key */
export function resolve_ai_api_key(
  client_record: client,
  request_key: string | undefined,
): { ok: true; key: string } | { ok: false; error: string } {
  if (client_record.exempt_ai_api_key) {
    const server_key = process.env["ANTHROPIC_API_KEY"];
    if (!server_key) {
      return { ok: false, error: "Server Anthropic API key not configured" };
    }
    return { ok: true, key: server_key };
  }

  if (!request_key) {
    return { ok: false, error: "ai_api_key is required" };
  }

  return { ok: true, key: request_key };
}
