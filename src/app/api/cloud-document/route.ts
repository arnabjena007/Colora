import { type CloudDocumentRecord, type CloudEditorState } from "@/lib/cloud-document";

export const runtime = "nodejs";

interface SaveCloudDocumentBody {
  documentId?: string;
  browserKey?: string;
  title?: string;
  payload?: CloudEditorState;
}

const getSupabaseEnv = () => {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    ?? process.env.SUPABASE_SERVICE_KEY
    ?? process.env.SUPABASE_SECRET_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return { url, serviceRoleKey, anonKey };
};

const getMissingSupabaseConfigMessage = (url?: string, key?: string) => {
  const missing = [
    !url ? "SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL" : "",
    !key ? "SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY" : "",
  ].filter(Boolean);

  return `Supabase is not configured. Missing server env: ${missing.join(", ")}.`;
};

const createSupabaseHeaders = (apiKey: string, bearerToken = apiKey) => ({
  apikey: apiKey,
  Authorization: `Bearer ${bearerToken}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
});

const readSupabaseBody = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
};

const formatSupabaseError = (body: unknown, fallback: string) => {
  if (!body || typeof body !== "object") return fallback;

  const error = body as { message?: string; details?: string; hint?: string; code?: string };
  return [error.message, error.details, error.hint, error.code ? `(${error.code})` : ""]
    .filter(Boolean)
    .join(" ")
    || fallback;
};

const resolveUserSession = async (request: Request, url: string, anonKey?: string) => {
  const accessToken = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken || !anonKey) return { accessToken: null, userId: null };

  try {
    const response = await fetch(`${url}/auth/v1/user`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });
    if (!response.ok) return { accessToken: null, userId: null };
    const user = await response.json() as { id?: string };
    return { accessToken, userId: user.id ?? null };
  } catch {
    return { accessToken: null, userId: null };
  }
};

const createRestHeaders = (serviceRoleKey: string | undefined, anonKey: string | undefined, accessToken: string | null) => {
  if (serviceRoleKey) return createSupabaseHeaders(serviceRoleKey);
  if (anonKey && accessToken) return createSupabaseHeaders(anonKey, accessToken);
  return null;
};

export async function GET(request: Request) {
  const { url, serviceRoleKey, anonKey } = getSupabaseEnv();
  if (!url || (!serviceRoleKey && !anonKey)) {
    return Response.json({ error: getMissingSupabaseConfigMessage(url, serviceRoleKey ?? anonKey) }, { status: 503 });
  }

  const searchParams = new URL(request.url).searchParams;
  const browserKey = searchParams.get("browserKey")?.trim();
  const documentId = searchParams.get("documentId")?.trim();
  const mode = searchParams.get("mode")?.trim();
  const { accessToken, userId } = await resolveUserSession(request, url, anonKey);
  const restHeaders = createRestHeaders(serviceRoleKey, anonKey, accessToken);

  if (!restHeaders) {
    return Response.json({ error: getMissingSupabaseConfigMessage(url, serviceRoleKey) }, { status: 503 });
  }

  if (!browserKey && !userId) {
    return Response.json({ error: "Missing browserKey" }, { status: 400 });
  }

  const ownerQuery = userId
    ? `user_id=eq.${encodeURIComponent(userId)}`
    : `browser_key=eq.${encodeURIComponent(browserKey ?? "")}`;

  const query = mode === "list"
    ? `select=id,title,updated_at,created_at,user_id,browser_key,payload->totalPages,payload->sourceFiles&${ownerQuery}&order=updated_at.desc&limit=30`
    : documentId
      ? `select=*&id=eq.${encodeURIComponent(documentId)}&${ownerQuery}&limit=1`
      : `select=*&${ownerQuery}&order=updated_at.desc&limit=1`;

  try {
    const response = await fetch(`${url}/rest/v1/cloud_documents?${query}`, {
      headers: restHeaders,
      cache: "no-store",
    });
    const rows = await readSupabaseBody(response) as CloudDocumentRecord[] | { message?: string } | null;

    if (!response.ok) {
      return Response.json(
        { error: formatSupabaseError(rows, "Could not load cloud document") },
        { status: response.status },
      );
    }

    if (mode === "list") {
      return Response.json({ documents: Array.isArray(rows) ? rows : [] });
    }

    const document = Array.isArray(rows) ? rows[0] ?? null : null;
    return Response.json({ document });
  } catch {
    return Response.json({ error: "Could not reach Supabase" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const { url, serviceRoleKey, anonKey } = getSupabaseEnv();
  if (!url || (!serviceRoleKey && !anonKey)) {
    return Response.json({ error: getMissingSupabaseConfigMessage(url, serviceRoleKey ?? anonKey) }, { status: 503 });
  }

  let body: SaveCloudDocumentBody;
  try {
    body = await request.json() as SaveCloudDocumentBody;
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const browserKey = body.browserKey?.trim();
  const title = body.title?.trim() || "Untitled document";
  const documentId = body.documentId?.trim();
  const payload = body.payload;
  const { accessToken, userId } = await resolveUserSession(request, url, anonKey);
  const restHeaders = createRestHeaders(serviceRoleKey, anonKey, accessToken);

  if (!restHeaders) {
    return Response.json({ error: getMissingSupabaseConfigMessage(url, serviceRoleKey) }, { status: 503 });
  }

  if (!browserKey && !userId) {
    return Response.json({ error: "Missing browserKey" }, { status: 400 });
  }

  if (!payload) {
    return Response.json({ error: "Missing payload" }, { status: 400 });
  }

  const draft = {
    browser_key: browserKey ?? "",
    user_id: userId,
    title,
    payload,
  };

  try {
    let response: Response;
    const ownerQuery = userId
      ? `user_id=eq.${encodeURIComponent(userId)}`
      : `browser_key=eq.${encodeURIComponent(browserKey ?? "")}`;
    if (documentId) {
      response = await fetch(`${url}/rest/v1/cloud_documents?id=eq.${encodeURIComponent(documentId)}&${ownerQuery}`, {
        method: "PATCH",
        headers: restHeaders,
        body: JSON.stringify(draft),
      });
    } else {
      response = await fetch(`${url}/rest/v1/cloud_documents`, {
        method: "POST",
        headers: restHeaders,
        body: JSON.stringify(draft),
      });
    }

    const rows = await readSupabaseBody(response) as CloudDocumentRecord[] | { message?: string } | null;
    if (!response.ok) {
      return Response.json(
        { error: formatSupabaseError(rows, "Could not save cloud document") },
        { status: response.status },
      );
    }

    const document = Array.isArray(rows) ? rows[0] ?? null : null;
    return Response.json({ document });
  } catch {
    return Response.json({ error: "Could not reach Supabase" }, { status: 502 });
  }
}
