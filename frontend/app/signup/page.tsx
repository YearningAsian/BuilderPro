"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

type FormErrors = {
  fullName?: string;
  companyName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  submit?: string;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignUpPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [successMessage, setSuccessMessage] = useState("");

  const canSubmit = useMemo(
    () =>
      fullName.trim().length > 0 &&
      companyName.trim().length > 0 &&
      email.trim().length > 0 &&
      password.length > 0 &&
      confirmPassword.length > 0 &&
      !isSubmitting,
    [fullName, companyName, email, password, confirmPassword, isSubmitting]
  );

  const validate = (): FormErrors => {
    const nextErrors: FormErrors = {};

    if (!fullName.trim()) nextErrors.fullName = "Full name is required.";
    if (!companyName.trim()) nextErrors.companyName = "Company name is required.";

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
      const response = await fetch(`${baseUrl}/auth/signup-company`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          full_name: fullName.trim(),
          company_name: companyName.trim(),
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = payload && typeof payload.detail === "string" ? payload.detail : "Unable to create account.";
        throw new Error(detail);
      }

      const requiresEmailConfirmation = Boolean(payload?.requires_email_confirmation);
      const accessToken = payload?.access_token as string | undefined;
      const role = (payload?.role as string | undefined) || "admin";
      const workspaceId = (payload?.workspace_id as string | undefined) || "";
      const workspaceName = (payload?.workspace_name as string | undefined) || "";
      const normalizedEmail = email.trim().toLowerCase();

      if (accessToken) {
        const sessionData = JSON.stringify({
          email: normalizedEmail,
          role,
          accessToken,
          tokenType: payload?.token_type || "bearer",
          workspaceId,
          workspaceName,
          signedInAt: new Date().toISOString(),
        });

        localStorage.setItem("builderpro_session", sessionData);
        sessionStorage.removeItem("builderpro_session");
        document.cookie = `builderpro_auth=1; Path=/; Max-Age=${60 * 60 * 24 * 14}; SameSite=Lax`;
        document.cookie = `builderpro_role=${role}; Path=/; Max-Age=${60 * 60 * 24 * 14}; SameSite=Lax`;

        router.push("/");
        return;
      }

      setSuccessMessage(
        requiresEmailConfirmation
          ? "Account created. Check your email to confirm your account, then sign in."
          : "Account created successfully. Please sign in."
      );
      setPassword("");
      setConfirmPassword("");
    } catch (error) {
      setErrors({
        submit: error instanceof Error && error.message ? error.message : "Unable to create account.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-10 sm:px-10 sm:py-14 flex items-center justify-center">
      <div className="card w-full max-w-lg p-8 animate-fade-in">
        <h1 className="text-2xl font-semibold text-gray-900">Create your Builder Pro workspace</h1>
        <p className="mt-2 text-sm text-gray-600">
          Start a new company workspace. Your account will be created as the workspace admin.
        </p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
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
            <label htmlFor="companyName" className="block text-sm font-medium text-gray-800 mb-1">
              Company Name
            </label>
            <input
              id="companyName"
              type="text"
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              placeholder="Enter your company name"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 bg-white outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
            />
            {errors.companyName && <p className="mt-1 text-sm text-red-600">{errors.companyName}</p>}
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
            {isSubmitting ? "Creating workspace..." : "Create Workspace"}
          </button>
        </form>

        <div className="mt-6 flex flex-col items-center gap-2 text-sm">
          <Link href="/join-invite" className="font-medium text-orange-600 hover:text-orange-700">
            Have an invite?
          </Link>
          <Link href="/signin" className="text-gray-600 hover:text-gray-900">
            Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
