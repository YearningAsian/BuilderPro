"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getActiveSession, type BuilderProSession } from "@/lib/auth";
import { authApi } from "@/services/api";

function persistWorkspaceDetails(
  currentSession: BuilderProSession,
  workspaceId?: string | null,
  workspaceName?: string | null,
  role?: "admin" | "user",
) {
  if (typeof window === "undefined") return;

  const nextSession: BuilderProSession = {
    ...currentSession,
    role: role ?? currentSession.role,
    workspaceId: workspaceId ?? currentSession.workspaceId,
    workspaceName: workspaceName ?? currentSession.workspaceName,
  };

  const serialized = JSON.stringify(nextSession);

  if (localStorage.getItem("builderpro_session")) {
    localStorage.setItem("builderpro_session", serialized);
  } else {
    sessionStorage.setItem("builderpro_session", serialized);
  }
}

export default function SettingsPage() {
  const [session, setSession] = useState<BuilderProSession | null>(null);
  const [workspaceId, setWorkspaceId] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [inviteLink, setInviteLink] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(false);
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);

  useEffect(() => {
    const activeSession = getActiveSession();
    setSession(activeSession);
    setWorkspaceId(activeSession?.workspaceId ?? "");
    setWorkspaceName(activeSession?.workspaceName ?? "");
  }, []);

  useEffect(() => {
    if (!session?.accessToken || (workspaceId && workspaceName)) {
      return;
    }

    let active = true;

    async function loadWorkspaceInfo() {
      setIsLoadingWorkspace(true);
      setErrorMessage("");

      try {
        const info = await authApi.me();
        if (!active) return;

        setWorkspaceId(info.workspace_id ?? "");
        setWorkspaceName(info.workspace_name ?? "");

        if (session) {
          persistWorkspaceDetails(session, info.workspace_id, info.workspace_name, info.role);
          setSession({
            ...session,
            role: info.role,
            workspaceId: info.workspace_id ?? undefined,
            workspaceName: info.workspace_name ?? undefined,
          });
        }
      } catch (error) {
        if (!active) return;
        setErrorMessage(
          error instanceof Error && error.message
            ? error.message
            : "Unable to load workspace details.",
        );
      } finally {
        if (active) {
          setIsLoadingWorkspace(false);
        }
      }
    }

    void loadWorkspaceInfo();

    return () => {
      active = false;
    };
  }, [session, workspaceId, workspaceName]);

  const isAdmin = session?.role === "admin";
  const canCreateInvite = useMemo(
    () =>
      Boolean(isAdmin && workspaceId && inviteEmail.trim().length > 0 && !isCreatingInvite),
    [isAdmin, workspaceId, inviteEmail, isCreatingInvite],
  );

  const handleCreateInvite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setStatusMessage("");
    setCopied(false);

    const normalizedEmail = inviteEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      setErrorMessage("Worker email is required.");
      return;
    }

    if (!workspaceId) {
      setErrorMessage("Workspace info is still loading. Please try again in a moment.");
      return;
    }

    setIsCreatingInvite(true);

    try {
      const invite = await authApi.createInvite({
        workspace_id: workspaceId,
        invited_email: normalizedEmail,
        expires_in_days: expiresInDays,
      });

      const inviteUrl = `${window.location.origin}/join-invite?token=${encodeURIComponent(invite.invite_token)}&email=${encodeURIComponent(invite.invited_email)}`;
      setInviteLink(inviteUrl);
      setStatusMessage(`Invite link ready for ${invite.invited_email}.`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error && error.message
          ? error.message
          : "Unable to create invite link.",
      );
    } finally {
      setIsCreatingInvite(false);
    }
  };

  const handleCopy = async () => {
    if (!inviteLink) return;

    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
    } catch {
      setCopied(false);
      setErrorMessage("Could not copy the link automatically. Please copy it manually.");
    }
  };

  if (!session) {
    return (
      <div className="p-6 lg:p-8">
        <div className="card max-w-xl p-6 space-y-3">
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-600">You need to sign in before opening admin settings.</p>
          <Link href="/signin" className="text-sm font-medium text-orange-600 hover:text-orange-700">
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-6 lg:p-8">
        <div className="card max-w-xl p-6 space-y-3">
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-600">This area is reserved for workspace admins.</p>
          <Link href="/projects" className="text-sm font-medium text-orange-600 hover:text-orange-700">
            Back to projects
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Create a secure join link for a worker to enter your workspace.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="card p-5 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Invite a worker</h2>
            <p className="text-sm text-gray-600 mt-1">
              Generate a link and send it to the worker by text, email, or chat.
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleCreateInvite}>
            <div>
              <label htmlFor="inviteEmail" className="block text-sm font-medium text-gray-800 mb-1">
                Worker email
              </label>
              <input
                id="inviteEmail"
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="worker@company.com"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 bg-white outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
              />
            </div>

            <div>
              <label htmlFor="expiresInDays" className="block text-sm font-medium text-gray-800 mb-1">
                Link expires in
              </label>
              <select
                id="expiresInDays"
                value={expiresInDays}
                onChange={(event) => setExpiresInDays(Number(event.target.value))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 bg-white outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
              >
                <option value={1}>1 day</option>
                <option value={3}>3 days</option>
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
              </select>
            </div>

            {errorMessage && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {errorMessage}
              </p>
            )}

            {statusMessage && (
              <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                {statusMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={!canCreateInvite}
              className="rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:bg-orange-300 disabled:cursor-not-allowed"
            >
              {isCreatingInvite ? "Creating invite..." : "Create join link"}
            </button>
          </form>

          {inviteLink && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
              <p className="text-sm font-medium text-gray-800">Share this join link</p>
              <textarea
                readOnly
                value={inviteLink}
                rows={3}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
              />
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-white"
                >
                  {copied ? "Copied" : "Copy link"}
                </button>
                <Link
                  href={inviteLink}
                  target="_blank"
                  className="rounded-lg border border-orange-300 px-3 py-2 text-sm font-medium text-orange-700 hover:bg-orange-50"
                >
                  Open join page
                </Link>
              </div>
            </div>
          )}
        </section>

        <aside className="card p-5 space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Workspace</h2>
          <div className="text-sm text-gray-600 space-y-2">
            <p><span className="font-medium text-gray-800">Admin:</span> {session.email}</p>
            <p><span className="font-medium text-gray-800">Workspace:</span> {workspaceName || "Loading..."}</p>
            <p><span className="font-medium text-gray-800">Workspace ID:</span> {workspaceId || "Loading..."}</p>
          </div>

          {isLoadingWorkspace && (
            <p className="text-sm text-gray-500">Refreshing workspace details...</p>
          )}

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
            After you send the link, the worker can open it, set a password, and join your company workspace.
          </div>
        </aside>
      </div>
    </div>
  );
}
