export type BuilderProSession = {
  email: string;
  role: "admin" | "user";
  accessToken: string;
  tokenType: string;
  workspaceId?: string;
  workspaceName?: string;
  signedInAt: string;
  lastActiveAt?: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
const AUTH_COOKIE_MAX_AGE = "Max-Age=0";
const SESSION_ABSOLUTE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const SESSION_IDLE_TIMEOUT_MS = 12 * 60 * 60 * 1000;
const SESSION_ACTIVITY_WRITE_THROTTLE_MS = 5 * 60 * 1000;

function nowMs(): number {
  return Date.now();
}

function parseTimestamp(value?: string): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeRole(role: unknown): "admin" | "user" | null {
  if (role === "admin" || role === "user") return role;
  return null;
}

function isSessionExpired(session: BuilderProSession): boolean {
  const now = nowMs();
  const signedInAt = parseTimestamp(session.signedInAt);
  const lastActiveAt = parseTimestamp(session.lastActiveAt || session.signedInAt);

  if (!signedInAt || !lastActiveAt) {
    return true;
  }

  if (now - signedInAt > SESSION_ABSOLUTE_MAX_AGE_MS) {
    return true;
  }

  if (now - lastActiveAt > SESSION_IDLE_TIMEOUT_MS) {
    return true;
  }

  return false;
}

function setAuthPresenceCookie(persistent: boolean): void {
  if (typeof document === "undefined") return;

  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:"
      ? "; Secure"
      : "";
  const maxAge = persistent ? `; Max-Age=${60 * 60 * 24 * 14}` : "";

  document.cookie = `builderpro_auth=1; Path=/${maxAge}; SameSite=Lax${secure}`;
}

function writeSession(session: BuilderProSession, remember: boolean): void {
  const payload = JSON.stringify(session);

  if (remember) {
    localStorage.setItem("builderpro_session", payload);
    sessionStorage.removeItem("builderpro_session");
  } else {
    sessionStorage.setItem("builderpro_session", payload);
    localStorage.removeItem("builderpro_session");
  }

  setAuthPresenceCookie(remember);
}

export function persistSession(
  session: Omit<BuilderProSession, "signedInAt" | "lastActiveAt">,
  remember = true,
): BuilderProSession {
  if (typeof window === "undefined") {
    return {
      ...session,
      signedInAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    };
  }

  const nowIso = new Date().toISOString();
  const nextSession: BuilderProSession = {
    ...session,
    signedInAt: nowIso,
    lastActiveAt: nowIso,
  };

  writeSession(nextSession, remember);
  return nextSession;
}

export function refreshSessionActivity(): void {
  if (typeof window === "undefined") return;

  const persistedRaw = localStorage.getItem("builderpro_session");
  const sessionRaw = persistedRaw ?? sessionStorage.getItem("builderpro_session");
  const parsed = parseSession(sessionRaw);
  if (!parsed) return;

  const now = nowMs();
  const lastActiveAt = parseTimestamp(parsed.lastActiveAt || parsed.signedInAt) ?? 0;
  if (now - lastActiveAt < SESSION_ACTIVITY_WRITE_THROTTLE_MS) {
    return;
  }

  const refreshed: BuilderProSession = {
    ...parsed,
    lastActiveAt: new Date(now).toISOString(),
  };

  writeSession(refreshed, Boolean(persistedRaw));
}

export function switchActiveWorkspace(workspaceId: string, workspaceName: string): BuilderProSession | null {
  if (typeof window === "undefined") return null;

  const persistedRaw = localStorage.getItem("builderpro_session");
  const sessionRaw = persistedRaw ?? sessionStorage.getItem("builderpro_session");
  const parsed = parseSession(sessionRaw);
  if (!parsed) return null;

  const nowIso = new Date().toISOString();
  const nextSession: BuilderProSession = {
    ...parsed,
    workspaceId,
    workspaceName,
    lastActiveAt: nowIso,
  };

  writeSession(nextSession, Boolean(persistedRaw));
  return nextSession;
}

function parseSession(raw: string | null): BuilderProSession | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<BuilderProSession>;
    if (!parsed || typeof parsed !== "object") return null;
    const role = normalizeRole(parsed.role);
    if (!parsed.email || !role || !parsed.accessToken) return null;

    const session: BuilderProSession = {
      email: parsed.email,
      role,
      accessToken: parsed.accessToken,
      tokenType: parsed.tokenType || "bearer",
      workspaceId: parsed.workspaceId,
      workspaceName: parsed.workspaceName,
      signedInAt: parsed.signedInAt || new Date().toISOString(),
      lastActiveAt: parsed.lastActiveAt || parsed.signedInAt || new Date().toISOString(),
    };

    return isSessionExpired(session) ? null : session;
  } catch {
    return null;
  }
}

export function getActiveSession(): BuilderProSession | null {
  if (typeof window === "undefined") return null;

  const persistedRaw = localStorage.getItem("builderpro_session");
  const persisted = parseSession(persistedRaw);
  if (persisted) return persisted;
  if (persistedRaw) {
    localStorage.removeItem("builderpro_session");
  }

  const sessionRaw = sessionStorage.getItem("builderpro_session");
  const session = parseSession(sessionRaw);
  if (session) return session;
  if (sessionRaw) {
    sessionStorage.removeItem("builderpro_session");
  }

  return null;
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
