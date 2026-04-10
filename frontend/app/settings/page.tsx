"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getActiveSession, type BuilderProSession } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/format";
import { authApi } from "@/services/api";
import type { AuditLogEntry, WorkspaceInviteSummary, WorkspaceMember, WorkspaceRole } from "@/types";

type AuditFilter = "all" | "orders" | "members" | "invites" | "other";
type InviteActionType = "resend" | "revoke" | null;

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

function buildInviteEmailUrl(recipientEmail: string, workspaceName: string, inviteLink: string) {
  const subject = encodeURIComponent(`You're invited to join ${workspaceName}`);
  const body = encodeURIComponent(
    `Hi,\n\nYou've been invited to join ${workspaceName} in Builder Pro.\n\nOpen the link below, then complete the Join Workspace form:\n${inviteLink}\n\nIf the page asks for an invite token, you can paste the full link or use the token from the URL.\n`
  );

  return `mailto:${encodeURIComponent(recipientEmail)}?subject=${subject}&body=${body}`;
}

function buildInviteUrl(origin: string, inviteToken: string, invitedEmail: string) {
  return `${origin}/join-invite?token=${encodeURIComponent(inviteToken)}&email=${encodeURIComponent(invitedEmail)}`;
}

export default function SettingsPage() {
  const [session, setSession] = useState<BuilderProSession | null>(null);
  const [workspaceId, setWorkspaceId] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceProfileName, setWorkspaceProfileName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [inviteLink, setInviteLink] = useState("");
  const [inviteRecipient, setInviteRecipient] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(false);
  const [isSavingWorkspaceProfile, setIsSavingWorkspaceProfile] = useState(false);
  const [isLoadingBillingSummary, setIsLoadingBillingSummary] = useState(false);
  const [billingSummary, setBillingSummary] = useState<{
    member_count: number;
    material_count: number;
    active_project_count: number;
    draft_project_count: number;
    monthly_estimate_total: number;
    plan_name: string;
  } | null>(null);
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<WorkspaceInviteSummary[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditLogEntry[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [isLoadingInvites, setIsLoadingInvites] = useState(false);
  const [isLoadingAuditEvents, setIsLoadingAuditEvents] = useState(false);
  const [memberActionId, setMemberActionId] = useState<string | null>(null);
  const [inviteActionId, setInviteActionId] = useState<string | null>(null);
  const [inviteActionType, setInviteActionType] = useState<InviteActionType>(null);
  const [auditFilter, setAuditFilter] = useState<AuditFilter>("all");

  useEffect(() => {
    const activeSession = getActiveSession();
    setSession(activeSession);
    setWorkspaceId(activeSession?.workspaceId ?? "");
    setWorkspaceName(activeSession?.workspaceName ?? "");
    setWorkspaceProfileName(activeSession?.workspaceName ?? "");
  }, []);

  useEffect(() => {
    setWorkspaceProfileName(workspaceName);
  }, [workspaceName]);

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

  useEffect(() => {
    if (!session?.accessToken || !isAdmin || !workspaceId) {
      setBillingSummary(null);
      return;
    }

    let active = true;
    async function loadBillingSummary() {
      setIsLoadingBillingSummary(true);
      try {
        const summary = await authApi.getWorkspaceBillingSummary();
        if (!active) return;
        setBillingSummary(summary);
      } catch (error) {
        if (!active) return;
        setErrorMessage(
          error instanceof Error && error.message
            ? error.message
            : "Unable to load workspace billing summary.",
        );
      } finally {
        if (active) {
          setIsLoadingBillingSummary(false);
        }
      }
    }

    void loadBillingSummary();

    return () => {
      active = false;
    };
  }, [session?.accessToken, isAdmin, workspaceId]);

  useEffect(() => {
    if (!session?.accessToken || !isAdmin || !workspaceId) {
      setMembers([]);
      setPendingInvites([]);
      setAuditEvents([]);
      return;
    }

    let active = true;

    async function loadAdminData() {
      setIsLoadingMembers(true);
      setIsLoadingInvites(true);
      setIsLoadingAuditEvents(true);

      try {
        const [nextMembers, nextInvites, nextEvents] = await Promise.all([
          authApi.listMembers(),
          authApi.listInvites(),
          authApi.listAuditEvents(),
        ]);
        if (!active) return;
        setMembers(nextMembers);
        setPendingInvites(nextInvites);
        setAuditEvents(nextEvents);
      } catch (error) {
        if (!active) return;
        setErrorMessage(
          error instanceof Error && error.message
            ? error.message
            : "Unable to load workspace admin details.",
        );
      } finally {
        if (active) {
          setIsLoadingMembers(false);
          setIsLoadingInvites(false);
          setIsLoadingAuditEvents(false);
        }
      }
    }

    void loadAdminData();

    return () => {
      active = false;
    };
  }, [session?.accessToken, isAdmin, workspaceId]);

  const canCreateInvite = useMemo(
    () =>
      Boolean(
        isAdmin &&
          workspaceId.trim().length > 0 &&
          inviteEmail.trim().length > 0 &&
          !isCreatingInvite &&
          !isLoadingWorkspace,
      ),
    [isAdmin, workspaceId, inviteEmail, isCreatingInvite, isLoadingWorkspace],
  );

  const filteredAuditEvents = useMemo(() => {
    if (auditFilter === "all") return auditEvents;

    const isMemberAction = (action: string) => action.startsWith("member.");
    const isInviteAction = (action: string) => action.includes("invite");
    const isOrderAction = (action: string) => action.startsWith("orders.");

    return auditEvents.filter((event) => {
      if (auditFilter === "orders") return isOrderAction(event.action);
      if (auditFilter === "members") return isMemberAction(event.action);
      if (auditFilter === "invites") return isInviteAction(event.action);
      return !isOrderAction(event.action) && !isMemberAction(event.action) && !isInviteAction(event.action);
    });
  }, [auditEvents, auditFilter]);

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
      setErrorMessage(
        "Workspace details are not available for this account yet. Refresh the page or sign in again as your workspace admin."
      );
      return;
    }

    setIsCreatingInvite(true);

    try {
      const invite = await authApi.createInvite({
        workspace_id: workspaceId,
        invited_email: normalizedEmail,
        expires_in_days: expiresInDays,
      });

      const inviteUrl = buildInviteUrl(window.location.origin, invite.invite_token, invite.invited_email);
      setInviteLink(inviteUrl);
      setInviteRecipient(invite.invited_email);
      setStatusMessage(`Invite prepared for ${invite.invited_email}. Your email app should open with the invite link ready to send.`);
      const [nextInvites, nextAuditEvents] = await Promise.all([
        authApi.listInvites(),
        authApi.listAuditEvents(),
      ]);
      setPendingInvites(nextInvites);
      setAuditEvents(nextAuditEvents);

      if (typeof window !== "undefined") {
        window.location.href = buildInviteEmailUrl(
          invite.invited_email,
          workspaceName || "your Builder Pro workspace",
          inviteUrl,
        );
      }
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

  const handleWorkspaceProfileUpdate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextName = workspaceProfileName.trim();

    if (!nextName) {
      setErrorMessage("Workspace name is required.");
      return;
    }

    if (nextName === workspaceName.trim()) {
      setStatusMessage("Workspace name is unchanged.");
      return;
    }

    setErrorMessage("");
    setStatusMessage("");
    setIsSavingWorkspaceProfile(true);

    try {
      const updated = await authApi.updateWorkspaceProfile({ name: nextName });
      setWorkspaceName(updated.workspace_name);
      if (session) {
        persistWorkspaceDetails(session, updated.workspace_id, updated.workspace_name);
        setSession({
          ...session,
          workspaceId: updated.workspace_id,
          workspaceName: updated.workspace_name,
        });
      }
      setStatusMessage(`Workspace profile updated to ${updated.workspace_name}.`);
      setAuditEvents(await authApi.listAuditEvents());
    } catch (error) {
      setErrorMessage(
        error instanceof Error && error.message
          ? error.message
          : "Unable to update workspace profile.",
      );
    } finally {
      setIsSavingWorkspaceProfile(false);
    }
  };

  const handleMemberRoleChange = async (memberId: string, nextRole: WorkspaceRole) => {
    setErrorMessage("");
    setStatusMessage("");
    setMemberActionId(memberId);

    try {
      const updated = await authApi.updateMember(memberId, { role: nextRole });
      setMembers((prev) => prev.map((member) => (member.id === updated.id ? updated : member)));
      setAuditEvents(await authApi.listAuditEvents());
      setStatusMessage(`${updated.email} is now a ${updated.role}.`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error && error.message
          ? error.message
          : "Unable to update the workspace member role.",
      );
    } finally {
      setMemberActionId(null);
    }
  };

  const handleResendInvite = async (invite: WorkspaceInviteSummary) => {
    setErrorMessage("");
    setStatusMessage("");
    setCopied(false);
    setInviteActionId(invite.id);
    setInviteActionType("resend");

    try {
      const resentInvite = await authApi.resendInvite(invite.id);
      const inviteUrl = buildInviteUrl(
        window.location.origin,
        resentInvite.invite_token,
        resentInvite.invited_email,
      );

      setInviteLink(inviteUrl);
      setInviteRecipient(resentInvite.invited_email);
      setStatusMessage(`Invite resent for ${resentInvite.invited_email}. Your email app should open with the refreshed invite link ready to send.`);

      const [nextInvites, nextAuditEvents] = await Promise.all([
        authApi.listInvites(),
        authApi.listAuditEvents(),
      ]);
      setPendingInvites(nextInvites);
      setAuditEvents(nextAuditEvents);

      if (typeof window !== "undefined") {
        window.location.href = buildInviteEmailUrl(
          resentInvite.invited_email,
          workspaceName || "your Builder Pro workspace",
          inviteUrl,
        );
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error && error.message
          ? error.message
          : "Unable to resend invite.",
      );
    } finally {
      setInviteActionId(null);
      setInviteActionType(null);
    }
  };

  const handleRevokeInvite = async (invite: WorkspaceInviteSummary) => {
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(`Revoke invite for ${invite.invited_email}?`);
      if (!confirmed) return;
    }

    setErrorMessage("");
    setStatusMessage("");
    setInviteActionId(invite.id);
    setInviteActionType("revoke");

    try {
      await authApi.revokeInvite(invite.id);
      const [nextInvites, nextAuditEvents] = await Promise.all([
        authApi.listInvites(),
        authApi.listAuditEvents(),
      ]);
      setPendingInvites(nextInvites);
      setAuditEvents(nextAuditEvents);
      setStatusMessage(`Invite for ${invite.invited_email} was revoked.`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error && error.message
          ? error.message
          : "Unable to revoke invite.",
      );
    } finally {
      setInviteActionId(null);
      setInviteActionType(null);
    }
  };

  const handleRemoveMember = async (member: WorkspaceMember) => {
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(`Remove ${member.email} from ${workspaceName || "this workspace"}?`);
      if (!confirmed) return;
    }

    setErrorMessage("");
    setStatusMessage("");
    setMemberActionId(member.id);

    try {
      await authApi.deleteMember(member.id);
      setMembers((prev) => prev.filter((entry) => entry.id !== member.id));
      setAuditEvents(await authApi.listAuditEvents());
      setStatusMessage(`${member.email} was removed from the workspace.`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error && error.message
          ? error.message
          : "Unable to remove the workspace member.",
      );
    } finally {
      setMemberActionId(null);
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
              Generate the invite and open an email draft so you can send the link directly to the worker.
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
              {isCreatingInvite
                ? "Creating invite..."
                : isLoadingWorkspace && !workspaceId
                  ? "Loading workspace..."
                  : "Create & email invite"}
            </button>
          </form>

          {inviteLink && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
              <p className="text-sm font-medium text-gray-800">Invite email and join link</p>
              <textarea
                readOnly
                value={inviteLink}
                rows={3}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
              />
              <div className="flex flex-wrap gap-3">
                <Link
                  href={buildInviteEmailUrl(
                    inviteRecipient || inviteEmail.trim().toLowerCase(),
                    workspaceName || "your Builder Pro workspace",
                    inviteLink,
                  )}
                  className="rounded-lg border border-blue-300 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
                >
                  Email invite
                </Link>
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

          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-gray-900">Pending invites</p>
              <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-semibold text-gray-700">
                {pendingInvites.length}
              </span>
            </div>

            {isLoadingInvites ? (
              <p className="text-sm text-gray-500">Loading pending invites...</p>
            ) : pendingInvites.length === 0 ? (
              <p className="text-sm text-gray-500">No pending invites.</p>
            ) : (
              <div className="space-y-2">
                {pendingInvites.map((invite) => {
                  const isBusy = inviteActionId === invite.id;
                  const isResending = isBusy && inviteActionType === "resend";
                  const isRevoking = isBusy && inviteActionType === "revoke";
                  return (
                    <div key={invite.id} className="rounded-lg border border-gray-200 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{invite.invited_email}</p>
                          <p className="text-xs text-gray-500">
                            Expires {formatDate(invite.expires_at)}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleResendInvite(invite)}
                            className="rounded-lg border border-blue-300 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-blue-200 disabled:text-blue-300"
                          >
                            {isResending ? "Resending..." : "Resend"}
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleRevokeInvite(invite)}
                            className="rounded-lg border border-red-300 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-red-200 disabled:text-red-300"
                          >
                            {isRevoking ? "Revoking..." : "Revoke"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <aside className="card p-5 space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Workspace</h2>
          <div className="text-sm text-gray-600 space-y-2">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-gray-800">Admin:</span>
              <span>{session.email}</span>
              <span className="inline-flex items-center rounded-full border border-orange-200 bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-700">
                Workspace Admin
              </span>
            </p>
            <p>
              <span className="font-medium text-gray-800">Workspace:</span>{" "}
              {workspaceName || (isLoadingWorkspace ? "Loading..." : "Not available")}
            </p>
            <p>
              <span className="font-medium text-gray-800">Workspace ID:</span>{" "}
              {workspaceId || (isLoadingWorkspace ? "Loading..." : "Not available")}
            </p>
          </div>

          <form className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-3" onSubmit={handleWorkspaceProfileUpdate}>
            <p className="text-sm font-semibold text-gray-800">Workspace profile</p>
            <label htmlFor="workspaceName" className="block text-xs font-medium uppercase tracking-wide text-gray-500">
              Workspace name
            </label>
            <input
              id="workspaceName"
              type="text"
              value={workspaceProfileName}
              onChange={(event) => setWorkspaceProfileName(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
              placeholder="Workspace name"
              disabled={isSavingWorkspaceProfile}
            />
            <button
              type="submit"
              disabled={isSavingWorkspaceProfile || isLoadingWorkspace}
              className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {isSavingWorkspaceProfile ? "Saving..." : "Save workspace profile"}
            </button>
          </form>

          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900 space-y-2">
            <p className="font-semibold">Billing snapshot</p>
            {isLoadingBillingSummary ? (
              <p className="text-xs text-indigo-700">Loading billing metrics...</p>
            ) : !billingSummary ? (
              <p className="text-xs text-indigo-700">Billing metrics are unavailable.</p>
            ) : (
              <div className="space-y-1 text-xs">
                <p><span className="font-medium">Plan:</span> {billingSummary.plan_name}</p>
                <p><span className="font-medium">Members:</span> {billingSummary.member_count}</p>
                <p><span className="font-medium">Materials:</span> {billingSummary.material_count}</p>
                <p><span className="font-medium">Active projects:</span> {billingSummary.active_project_count}</p>
                <p><span className="font-medium">Draft projects:</span> {billingSummary.draft_project_count}</p>
                <p><span className="font-medium">Estimate volume:</span> {formatCurrency(billingSummary.monthly_estimate_total)}</p>
              </div>
            )}
          </div>

          {isLoadingWorkspace && (
            <p className="text-sm text-gray-500">Refreshing workspace details...</p>
          )}

          {!isLoadingWorkspace && !workspaceId && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              No workspace is linked to this account yet, so invite links cannot be generated until that is fixed.
            </div>
          )}

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-blue-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                Invited Worker
              </span>
              <span className="inline-flex items-center rounded-full border border-orange-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-orange-700">
                Workspace Admin
              </span>
            </div>
            After you send the email, the worker can open the invite link, complete the Join Workspace form, and they will be added under this admin and company workspace.
          </div>
        </aside>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="card p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Workspace members</h2>
              <p className="text-sm text-gray-600 mt-1">
                Review member roles and remove access when someone should no longer work in this workspace.
              </p>
            </div>
            <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-700">
              {members.length} member{members.length === 1 ? "" : "s"}
            </span>
          </div>

        {isLoadingMembers ? (
          <p className="text-sm text-gray-500">Loading workspace members...</p>
        ) : members.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
            No members are visible in this workspace yet.
          </div>
        ) : (
          <div className="space-y-3">
            {members.map((member) => {
              const isCurrentUser = member.email === session.email;
              const isBusy = memberActionId === member.id;

              return (
                <div key={member.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{member.full_name || member.email}</p>
                      <p className="text-sm text-gray-600">{member.email}</p>
                    </div>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${member.role === "admin" ? "border border-orange-200 bg-orange-100 text-orange-700" : "border border-gray-200 bg-gray-100 text-gray-700"}`}>
                      {member.role === "admin" ? "Admin" : "Member"}
                      {isCurrentUser ? " • You" : ""}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <label className="text-sm font-medium text-gray-800" htmlFor={`role-${member.id}`}>
                      Role
                    </label>
                    <select
                      id={`role-${member.id}`}
                      value={member.role}
                      disabled={isBusy || isCurrentUser}
                      onChange={(event) => {
                        void handleMemberRoleChange(member.id, event.target.value as WorkspaceRole);
                      }}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400 disabled:bg-gray-100"
                    >
                      <option value="admin">Admin</option>
                      <option value="user">Member</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => void handleRemoveMember(member)}
                      disabled={isBusy || isCurrentUser}
                      className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-red-200 disabled:text-red-300"
                    >
                      {isBusy ? "Working..." : "Remove access"}
                    </button>
                  </div>

                  {isCurrentUser && (
                    <p className="mt-2 text-xs text-gray-500">
                      Your own role and access are locked here for safety.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
        </section>

        <aside className="card p-5 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Recent activity</h2>
            <p className="text-sm text-gray-600 mt-1">
              Admin activity is now logged so workspace changes are easier to review.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {[
              { key: "all" as const, label: "All" },
              { key: "orders" as const, label: "Order events" },
              { key: "members" as const, label: "Member events" },
              { key: "invites" as const, label: "Invite events" },
              { key: "other" as const, label: "Other" },
            ].map((option) => {
              const isActive = auditFilter === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setAuditFilter(option.key)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                    isActive
                      ? "bg-orange-500 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          {isLoadingAuditEvents ? (
            <p className="text-sm text-gray-500">Loading activity...</p>
          ) : filteredAuditEvents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
              No events match the selected filter.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAuditEvents.map((event) => (
                <div key={event.id} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{event.action.replaceAll(".", " ")}</p>
                      <p className="text-xs text-gray-500">
                        {event.actor_email || "Unknown user"} • {formatDate(event.created_at)}
                      </p>
                    </div>
                    <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                      {event.resource_type}
                    </span>
                  </div>
                  {event.details && (
                    <div className="mt-2 text-xs text-gray-600 space-y-1">
                      {Object.entries(event.details).map(([key, value]) => (
                        <p key={key}>
                          <span className="font-medium text-gray-700">{key}:</span> {String(value)}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
