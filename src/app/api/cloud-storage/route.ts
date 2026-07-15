import crypto from "node:crypto";

export const runtime = "nodejs";

const getSupabaseEnv = () => {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    ?? process.env.SUPABASE_SERVICE_KEY
    ?? process.env.SUPABASE_SECRET_KEY
    ?? process.env.SUPABASE_SECRET_KEYS;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "colora-files";
  return { url, serviceRoleKey, bucket };
};

const getMissingSupabaseConfigMessage = (url?: string, serviceRoleKey?: string) => {
  const missing = [
    !url ? "SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL" : "",
    !serviceRoleKey ? "SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SERVICE_KEY, or SUPABASE_SECRET_KEYS" : "",
  ].filter(Boolean);

  return `Supabase storage is not configured. Missing server env: ${missing.join(", ")}.`;
};

const createSupabaseHeaders = (serviceRoleKey: string, contentType?: string) => ({
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  ...(contentType ? { "Content-Type": contentType } : {}),
  "x-upsert": "false",
});

const resolveUserId = async (request: Request, url: string) => {
  const accessToken = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!accessToken || !anonKey) return null;

  try {
    const response = await fetch(`${url}/auth/v1/user`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const user = await response.json() as { id?: string };
    return user.id ?? null;
  } catch {
    return null;
  }
};

export async function POST(request: Request) {
  const { url, serviceRoleKey, bucket } = getSupabaseEnv();
  if (!url || !serviceRoleKey) {
    return Response.json({ error: getMissingSupabaseConfigMessage(url, serviceRoleKey) }, { status: 503 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return Response.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  const browserKey = String(formData.get("browserKey") ?? "").trim();
  const documentId = String(formData.get("documentId") ?? "").trim();
  if (!(file instanceof File)) {
    return Response.json({ error: "Missing file" }, { status: 400 });
  }

  const userId = await resolveUserId(request, url);
  if (!userId && !browserKey) {
    return Response.json({ error: "Missing browser key" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const ownerSegment = userId ? `users/${userId}` : `browsers/${browserKey}`;
  const docSegment = documentId || "draft";
  const path = `${ownerSegment}/${docSegment}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;

  try {
    const response = await fetch(`${url}/storage/v1/object/${bucket}/${path}`, {
      method: "POST",
      headers: createSupabaseHeaders(serviceRoleKey, file.type || "application/octet-stream"),
      body: bytes,
    });

    if (!response.ok) {
      return Response.json({ error: "Could not upload file" }, { status: response.status });
    }

    return Response.json({
      file: {
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        storagePath: path,
        publicUrl: null,
      },
    });
  } catch {
    return Response.json({ error: "Could not reach Supabase storage" }, { status: 502 });
  }
}
