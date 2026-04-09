"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { persistSession } from "@/lib/auth";

type FormErrors = {
  inviteToken?: string;
  fullName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  submit?: string;
};

// RFC 5322 simplified email validation
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function extractInviteDetails(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return { token: "", email: undefined as string | undefined };
  }

  try {
    const url = new URL(trimmed);
    return {
      token: url.searchParams.get("token") || url.searchParams.get("invite_token") || trimmed,
      email: url.searchParams.get("email") || undefined,
    };
  } catch {
    const tokenMatch = trimmed.match(/[?&](?:token|invite_token)=([^&]+)/i);
    const emailMatch = trimmed.match(/[?&]email=([^&]+)/i);

    return {
      token: tokenMatch ? decodeURIComponent(tokenMatch[1]) : trimmed,
      email: emailMatch ? decodeURIComponent(emailMatch[1]) : undefined,
    };
  }
}

function JoinInvitePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [inviteToken, setInviteToken] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    const tokenFromQuery = searchParams.get("token") || searchParams.get("invite_token");
    const emailFromQuery = searchParams.get("email");

    if (tokenFromQuery) {
      setInviteToken(tokenFromQuery);
    }

    if (emailFromQuery) {
      setEmail(emailFromQuery);
    }
  }, [searchParams]);

  const canSubmit = useMemo(
    () =>
      inviteToken.trim().length > 0 &&
      fullName.trim().length > 0 &&
      email.trim().length > 0 &&
      password.length > 0 &&
      confirmPassword.length > 0 &&
      !isSubmitting,
    [inviteToken, fullName, email, password, confirmPassword, isSubmitting]
  );

  const validate = (): FormErrors => {
    const nextErrors: FormErrors = {};

    if (!inviteToken.trim()) nextErrors.inviteToken = "Invite token is required.";
    if (!fullName.trim()) nextErrors.fullName = "Full name is required.";

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      nextErrors.email = "Email is required.";
    } else if (!EMAIL_REGEX.test(normalizedEmail)) {
      nextErrors.email = "Please enter a valid email address.";
    }

    if (!password) {
      nextErrors.password = "Password is required.";
    } else if (password.length < 8) {
      nextErrors.password = "Password must be at least 8 characters.";
    }

    if (!confirmPassword) {
      nextErrors.confirmPassword = "Please confirm your password.";
    } else if (confirmPassword !== password) {
      nextErrors.confirmPassword = "Passwords do not match.";
    }

    return nextErrors;
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrors({});
    setSuccessMessage("");

    const nextErrors = validate();
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setIsSubmitting(true);

    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
      const response = await fetch(`${baseUrl}/auth/join-invite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          invite_token: inviteToken.trim(),
          full_name: fullName.trim(),
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = payload && typeof payload.detail === "string" ? payload.detail : "Unable to join workspace.";
        throw new Error(detail);
      }

      const requiresEmailConfirmation = Boolean(payload?.requires_email_confirmation);
      const accessToken = payload?.access_token as string | undefined;
      const role = (payload?.role as string | undefined) || "user";
      const workspaceId = (payload?.workspace_id as string | undefined) || "";
      const workspaceName = (payload?.workspace_name as string | undefined) || "";
      const normalizedEmail = email.trim().toLowerCase();

      if (accessToken) {
        const sessionData = {
          email: normalizedEmail,
          role,
          accessToken,
          tokenType: payload?.token_type || "bearer",
          workspaceId,
          workspaceName,
        };

        persistSession(sessionData, true);

        router.push("/projects");
        return;
      }

      setSuccessMessage(
        requiresEmailConfirmation
          ? "Account created. Check your email to confirm, then sign in."
          : "You joined the workspace successfully. Please sign in."
      );
      setPassword("");
      setConfirmPassword("");
    } catch (error) {
      setErrors({
        submit: error instanceof Error && error.message ? error.message : "Unable to join workspace.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-10 sm:px-10 sm:py-14 flex items-center justify-center">
      <div className="card w-full max-w-lg p-8 animate-fade-in">
        <h1 className="text-2xl font-semibold text-gray-900">Join your Builder Pro workspace</h1>
        <p className="mt-2 text-sm text-gray-600">
          Paste the invite link from the admin email, or just the invite token, then complete account setup to join that company workspace.
        </p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
          <div>
            <label htmlFor="inviteToken" className="block text-sm font-medium text-gray-800 mb-1">
              Invite Token
            </label>
            <input
              id="inviteToken"
              type="text"
              value={inviteToken}
              onChange={(event) => {
                const parsed = extractInviteDetails(event.target.value);
                setInviteToken(parsed.token);
                if (parsed.email) {
                  setEmail(parsed.email);
                }
              }}
              placeholder="Paste the invite link or token"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 bg-white outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
            />
            <p className="mt-1 text-xs text-gray-500">
              You can paste the full invite link from the email and the token will be filled in automatically.
            </p>
            {errors.inviteToken && <p className="mt-1 text-sm text-red-600">{errors.inviteToken}</p>}
          </div>

          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-gray-800 mb-1">
              Full Name
            </label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Enter your full name"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 bg-white outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
            />
            {errors.fullName && <p className="mt-1 text-sm text-red-600">{errors.fullName}</p>}
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-800 mb-1">
              Work Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Enter your work email"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 bg-white outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
            />
            {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email}</p>}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-800 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Create a password"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 bg-white outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
            />
            {errors.password && <p className="mt-1 text-sm text-red-600">{errors.password}</p>}
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-800 mb-1">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Confirm your password"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 bg-white outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
            />
            {errors.confirmPassword && <p className="mt-1 text-sm text-red-600">{errors.confirmPassword}</p>}
          </div>

          {errors.submit && <p className="text-sm text-red-600">{errors.submit}</p>}
          {successMessage && <p className="text-sm text-emerald-700">{successMessage}</p>}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-lg bg-orange-500 text-white py-2.5 text-sm font-semibold hover:bg-orange-600 disabled:bg-orange-300 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? "Joining workspace..." : "Join Workspace"}
          </button>
        </form>

        <div className="mt-6 flex flex-col items-center gap-2 text-sm">
          <Link href="/signin" className="font-medium text-orange-600 hover:text-orange-700">
            Back to Sign In
          </Link>
          <Link href="/signup" className="text-gray-600 hover:text-gray-900">
            Need a new company workspace?
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function JoinInvitePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 px-6 py-10 sm:px-10 sm:py-14 flex items-center justify-center">
          <div className="card w-full max-w-lg p-8 text-center text-sm text-gray-600">
            Loading invite details...
          </div>
        </div>
      }
    >
      <JoinInvitePageContent />
    </Suspense>
  );
}
