"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

import { authApi } from "@/services/api";

export default function ForgotPasswordPage() {
  const searchParams = useSearchParams();
  const prefilledToken = useMemo(() => searchParams.get("token") ?? "", [searchParams]);
  const prefilledTokenHash = useMemo(() => searchParams.get("token_hash") ?? "", [searchParams]);

  const [email, setEmail] = useState("");
  const [token, setToken] = useState(prefilledToken);
  const [tokenHash, setTokenHash] = useState(prefilledTokenHash);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [recoveryAccessToken, setRecoveryAccessToken] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const hasRecoveryTokenInput = token.trim().length > 0 || tokenHash.trim().length > 0;

  async function handleSendResetEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSending(true);

    try {
      const redirectTo = typeof window === "undefined" ? undefined : `${window.location.origin}/forgot-password`;
      const response = await authApi.forgotPassword({ email: email.trim(), redirect_to: redirectTo });
      setMessage(response.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not request password reset.");
    } finally {
      setIsSending(false);
    }
  }

  async function handleVerifyToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsVerifying(true);

    try {
      const response = await authApi.verifyRecovery({
        token: token.trim() || undefined,
        token_hash: tokenHash.trim() || undefined,
        email: email.trim() || undefined,
      });
      setRecoveryAccessToken(response.access_token);
      setMessage("Recovery token verified. You can now set a new password.");
    } catch (e) {
      setRecoveryAccessToken(null);
      setError(e instanceof Error ? e.message : "Could not verify recovery token.");
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!recoveryAccessToken) {
      setError("Verify your recovery token first.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsResetting(true);
    try {
      const response = await authApi.resetPassword({
        access_token: recoveryAccessToken,
        new_password: newPassword,
      });
      setMessage(response.message);
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reset password.");
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-10 sm:px-10 sm:py-14 flex items-center justify-center">
      <div className="card w-full max-w-lg p-8 animate-fade-in space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-gray-900">Forgot password</h1>
          <p className="text-sm text-gray-600">
            Request a reset email, verify your recovery token, then set a new password.
          </p>
        </div>

        <form className="space-y-3" onSubmit={handleSendResetEmail}>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-gray-700">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              placeholder="you@company.com"
              required
            />
          </label>
          <button
            type="submit"
            disabled={isSending}
            className="w-full rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-orange-300"
          >
            {isSending ? "Sending..." : "Send reset instructions"}
          </button>
        </form>

        <form className="space-y-3" onSubmit={handleVerifyToken}>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-gray-700">Recovery Token</span>
            <input
              type="text"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              placeholder="Paste token from email"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-gray-700">Token Hash (optional)</span>
            <input
              type="text"
              value={tokenHash}
              onChange={(event) => setTokenHash(event.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              placeholder="Use if your email provides token_hash"
            />
          </label>

          <button
            type="submit"
            disabled={isVerifying || !hasRecoveryTokenInput}
            className="w-full rounded-lg border border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
          >
            {isVerifying ? "Verifying..." : "Verify recovery token"}
          </button>
        </form>

        <form className="space-y-3" onSubmit={handleResetPassword}>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-gray-700">New Password</span>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              minLength={8}
              placeholder="At least 8 characters"
              required
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-gray-700">Confirm New Password</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              minLength={8}
              placeholder="Repeat your new password"
              required
            />
          </label>

          <button
            type="submit"
            disabled={isResetting || !recoveryAccessToken}
            className="w-full rounded-lg bg-gray-900 py-2.5 text-sm font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            {isResetting ? "Updating..." : "Update password"}
          </button>
        </form>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {message && <p className="text-sm text-green-700">{message}</p>}

        <div className="flex items-center justify-center gap-5 text-sm">
          <Link href="/signin" className="font-medium text-orange-600 hover:text-orange-700">
            Back to Sign In
          </Link>
          <Link href="/" className="text-gray-600 hover:text-gray-900">
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
