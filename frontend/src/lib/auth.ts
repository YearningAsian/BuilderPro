export type BuilderProSession = {
  email: string;
  role: "admin" | "user";
  accessToken: string;
  tokenType: string;
  workspaceId?: string;
  workspaceName?: string;
  signedInAt: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
const AUTH_COOKIE_MAX_AGE = "Max-Age=0";

function parseSession(raw: string | null): BuilderProSession | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<BuilderProSession>;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.email || !parsed.role || !parsed.accessToken) return null;

    return {
      email: parsed.email,
      role: parsed.role,
      accessToken: parsed.accessToken,
      tokenType: parsed.tokenType || "bearer",
      workspaceId: parsed.workspaceId,
      workspaceName: parsed.workspaceName,
      signedInAt: parsed.signedInAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function getActiveSession(): BuilderProSession | null {
  if (typeof window === "undefined") return null;

  const persisted = parseSession(localStorage.getItem("builderpro_session"));
  if (persisted) return persisted;

  return parseSession(sessionStorage.getItem("builderpro_session"));
}

export function clearLocalAuthState(): void {
  if (typeof window === "undefined") return;

  localStorage.removeItem("builderpro_session");
  sessionStorage.removeItem("builderpro_session");
  localStorage.removeItem("builderpro_workspace");
  sessionStorage.removeItem("builderpro_workspace");

  document.cookie = `builderpro_auth=; Path=/; ${AUTH_COOKIE_MAX_AGE}; SameSite=Lax`;
  document.cookie = `builderpro_role=; Path=/; ${AUTH_COOKIE_MAX_AGE}; SameSite=Lax`;
}

export async function requestSignOut(accessToken?: string): Promise<void> {
  const headers: HeadersInit = {
    Accept: "application/json",
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  await fetch(`${API_BASE}/auth/signout`, {
    method: "POST",
    headers,
    credentials: "include",
  });
}

export async function signOutUser(): Promise<void> {
  const session = getActiveSession();

  try {
    await requestSignOut(session?.accessToken);
  } catch (error) {
    console.warn("BuilderPro sign-out request failed; clearing local auth state instead.", error);
  } finally {
    clearLocalAuthState();
  }
}
