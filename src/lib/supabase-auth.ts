export interface SupabaseSession {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
  user?: {
    id: string;
    email?: string;
  };
}

export interface SupabaseUser {
  id: string;
  email?: string;
  user_metadata?: {
    avatar_url?: string;
    picture?: string;
    full_name?: string;
    name?: string;
  };
}

export class SupabaseAuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseAuthConfigError";
  }
}

export const getSupabasePublicEnv = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return { url, anonKey };
};

const getAuthRedirectUrl = () => {
  const explicitRedirect = process.env.NEXT_PUBLIC_AUTH_REDIRECT_URL?.trim();
  if (explicitRedirect) return explicitRedirect;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (siteUrl) return `${siteUrl.replace(/\/+$/, "")}/editor`;

  if (typeof window === "undefined") return "https://colora-devo.vercel.app/editor";

  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return `${window.location.origin}/editor`;
  }

  return "https://colora-devo.vercel.app/editor";
};

export const SUPABASE_SESSION_STORAGE_KEY = "colora-supabase-session";

export const getStoredSupabaseSession = (): SupabaseSession | null => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SUPABASE_SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SupabaseSession;
  } catch {
    return null;
  }
};

export const storeSupabaseSession = (session: SupabaseSession | null) => {
  if (typeof window === "undefined") return;
  if (!session) {
    window.localStorage.removeItem(SUPABASE_SESSION_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(SUPABASE_SESSION_STORAGE_KEY, JSON.stringify(session));
};

export const requestMagicLink = async (email: string) => {
  const { url, anonKey } = getSupabasePublicEnv();
  if (!url || !anonKey) throw new Error("Supabase auth is not configured");

  const response = await fetch(`${url}/auth/v1/otp`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      create_user: true,
      email_redirect_to: getAuthRedirectUrl(),
    }),
  });

  if (!response.ok) {
    throw new Error("Could not send magic link");
  }
};

export const startGoogleSignIn = () => {
  const { url, anonKey } = getSupabasePublicEnv();
  if (!url && !anonKey) {
    throw new SupabaseAuthConfigError("Missing NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
  if (!url) {
    throw new SupabaseAuthConfigError("Missing NEXT_PUBLIC_SUPABASE_URL.");
  }
  if (!anonKey) {
    throw new SupabaseAuthConfigError("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) {
    throw new SupabaseAuthConfigError("NEXT_PUBLIC_SUPABASE_URL is invalid.");
  }
  const redirectTo = getAuthRedirectUrl();
  const authUrl = `${url}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}`;
  if (typeof window !== "undefined") {
    window.location.assign(authUrl);
  }
};

export const fetchSupabaseUser = async (accessToken: string): Promise<SupabaseUser> => {
  const { url, anonKey } = getSupabasePublicEnv();
  if (!url || !anonKey) throw new Error("Supabase auth is not configured");

  const response = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) throw new Error("Could not fetch user");
  return await response.json() as SupabaseUser;
};

export const signOutSupabaseSession = async (accessToken: string) => {
  const { url, anonKey } = getSupabasePublicEnv();
  if (!url || !anonKey) throw new Error("Supabase auth is not configured");

  await fetch(`${url}/auth/v1/logout`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });
};
