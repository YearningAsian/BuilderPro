"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { persistSession, startDemoSession } from "@/lib/auth";

type FormErrors = {
  email?: string;
  password?: string;
  submit?: string;
};

type AuthResponse = {
  access_token: string;
  token_type: string;
  role: "admin" | "user";
  email: string;
  workspace_id?: string | null;
  workspace_name?: string | null;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateForm(email: string, password: string): FormErrors {
  const errors: FormErrors = {};

  if (!email.trim()) {
    errors.email = "Email is required.";
  } else if (!EMAIL_REGEX.test(email.trim())) {
    errors.email = "Please enter a valid email address.";
  }

  if (!password) {
    errors.password = "Password is required.";
  }

  return errors;
}

async function signInRequest(email: string, password: string): Promise<AuthResponse> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
  const response = await fetch(`${baseUrl}/auth/signin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    if (payload && typeof payload === "object" && "detail" in payload) {
      const detail = (payload as { detail?: unknown }).detail;
      if (typeof detail === "string" && detail.trim()) {
        throw new Error(detail);
      }
    }
    throw new Error("Invalid email or password.");
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid email or password.");
  }

  const auth = payload as Partial<AuthResponse>;
  if (!auth.access_token || !auth.role || !auth.email) {
    throw new Error("Invalid email or password.");
  }

  return {
    access_token: auth.access_token,
    token_type: auth.token_type || "bearer",
    role: auth.role,
    email: auth.email,
    workspace_id: auth.workspace_id || null,
    workspace_name: auth.workspace_name || null,
  };
}

function SignInPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberSession, setRememberSession] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLaunchingDemo, setIsLaunchingDemo] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [signedOutMessage, setSignedOutMessage] = useState("");

  useEffect(() => {
    const flash = sessionStorage.getItem("builderpro_flash_message");
    if (flash) {
      setSignedOutMessage(flash);
      sessionStorage.removeItem("builderpro_flash_message");
      return;
    }

    if (searchParams.get("signed_out") === "1") {
      setSignedOutMessage("You have been signed out.");
    }
  }, [searchParams]);

  const canSubmit = useMemo(
    () => email.trim().length > 0 && password.length > 0 && !isSubmitting && !isLaunchingDemo,
    [email, password, isSubmitting, isLaunchingDemo]
  );

  const onLaunchDemo = async () => {
    setErrors({});
    setIsLaunchingDemo(true);

    try {
      await startDemoSession();
      router.push("/");
    } catch (error) {
      setErrors({
        submit:
          error instanceof Error && error.message
            ? error.message
            : "Unable to launch the demo workspace.",
      });
    } finally {
      setIsLaunchingDemo(false);
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrors({});

    const formErrors = validateForm(email, password);
    if (Object.keys(formErrors).length > 0) {
      setErrors(formErrors);
      return;
    }

    setIsSubmitting(true);

    try {
      const auth = await signInRequest(email, password);

      const sessionData = {
        email: auth.email.trim().toLowerCase(),
        role: auth.role,
        accessToken: auth.access_token,
        tokenType: auth.token_type,
        workspaceId: auth.workspace_id || undefined,
        workspaceName: auth.workspace_name || undefined,
      };

      persistSession(sessionData, rememberSession);

      const params = new URLSearchParams(window.location.search);
      const requestedPath = params.get("next");
      if (requestedPath && requestedPath.startsWith("/")) {
        router.push(requestedPath);
      } else if (auth.role === "admin") {
        router.push("/");
      } else {
        router.push("/projects");
      }
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Invalid email or password.";
      setErrors({ submit: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
      <section className="bg-gray-100 border-b lg:border-b-0 lg:border-r border-gray-200 px-6 sm:px-10 py-10 sm:py-14 flex flex-col justify-between">
        <div>
          <div className="inline-flex items-center gap-2 mb-8">
            <span className="text-2xl font-bold text-orange-500">Builder</span>
            <span className="text-2xl font-bold text-gray-900">Pro</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-semibold text-gray-900 tracking-tight mb-3">
            Sign in to Builder Pro
          </h1>
          <p className="text-gray-600 max-w-xl">
            Access your projects, estimates, materials, and vendor workflows in one place.
          </p>

          <ul className="mt-8 space-y-3 text-sm text-gray-700">
            <li>Walk a buyer through active projects and estimate value in seconds</li>
            <li>Show real material, customer, and vendor records instead of an empty app</li>
            <li>Demonstrate PO creation, shipment tracking, and receiving status</li>
            <li>Search across workspace data with seeded construction examples</li>
          </ul>
        </div>

        <div className="card mt-10 p-5 max-w-lg">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Interactive Demo Workspace</h2>
              <p className="mt-1 text-sm text-gray-600">Northwind Builders is preloaded for buyer walkthroughs.</p>
            </div>
            <button
              type="button"
              onClick={onLaunchDemo}
              disabled={isLaunchingDemo || isSubmitting}
              className="rounded-full bg-gray-900 px-4 py-2 text-xs font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLaunchingDemo ? "Launching..." : "Open Demo"}
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-orange-50 px-3 py-3">
              <p className="text-xs uppercase tracking-wide text-orange-700">Projects</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">3 seeded jobs</p>
            </div>
            <div className="rounded-xl bg-emerald-50 px-3 py-3">
              <p className="text-xs uppercase tracking-wide text-emerald-700">Orders</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">Live PO status</p>
            </div>
            <div className="rounded-xl bg-sky-50 px-3 py-3">
              <p className="text-xs uppercase tracking-wide text-sky-700">Catalog</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">Materials + vendors</p>
            </div>
            <div className="rounded-xl bg-amber-50 px-3 py-3">
              <p className="text-xs uppercase tracking-wide text-amber-700">Search</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">Cross-workspace lookup</p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-gray-50 px-6 sm:px-10 py-10 sm:py-14 flex items-center justify-center">
        <div className="card w-full max-w-md p-6 sm:p-8 animate-fade-in">
          <h2 className="text-2xl font-semibold text-gray-900">Welcome back</h2>
          <p className="text-sm text-gray-600 mt-1 mb-6">Sign in to continue to Builder Pro</p>

          {signedOutMessage && (
            <p className="mb-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700" role="status">
              {signedOutMessage}
            </p>
          )}

          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-800 mb-1">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Enter your email"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 bg-white outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? "email-error" : undefined}
              />
              {errors.email && (
                <p id="email-error" className="mt-1 text-sm text-red-600">
                  {errors.email}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-800 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 pr-14 text-sm text-gray-900 bg-white outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? "password-error" : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute inset-y-0 right-2 my-1 px-2 text-xs font-medium text-gray-600 hover:text-gray-900"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              {errors.password && (
                <p id="password-error" className="mt-1 text-sm text-red-600">
                  {errors.password}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between gap-4">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={rememberSession}
                  onChange={(event) => setRememberSession(event.target.checked)}
                  className="rounded border-gray-300 text-orange-500 focus:ring-orange-300"
                />
                Remember me
              </label>
              <Link href="/forgot-password" className="text-sm font-medium text-orange-600 hover:text-orange-700">
                Forgot password?
              </Link>
            </div>

            {errors.submit && (
              <p className="text-sm text-red-600" role="alert">
                {errors.submit}
              </p>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full rounded-lg bg-orange-500 text-white py-2.5 text-sm font-semibold hover:bg-orange-600 disabled:bg-orange-300 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-30" />
                    <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="3" />
                  </svg>
                  Signing in...
                </span>
              ) : (
                "Sign In"
              )}
            </button>

            <button
              type="button"
              onClick={onLaunchDemo}
              disabled={isLaunchingDemo || isSubmitting}
              className="w-full rounded-lg border border-gray-300 bg-white py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
            >
              {isLaunchingDemo ? "Launching demo..." : "Launch Interactive Demo"}
            </button>

            <div className="flex items-center gap-3 py-1">
              <div className="h-px bg-gray-200 flex-1" />
              <span className="text-xs text-gray-500">or</span>
              <div className="h-px bg-gray-200 flex-1" />
            </div>

            <p className="text-sm text-gray-700 text-center">
              Starting a new company?{" "}
              <Link href="/signup" className="font-semibold text-orange-600 hover:text-orange-700">
                Create workspace
              </Link>
            </p>
            <p className="text-sm text-gray-700 text-center">
              Have an invite?{" "}
              <Link href="/join-invite" className="font-semibold text-orange-600 hover:text-orange-700">
                Join workspace
              </Link>
            </p>
          </form>

          <div className="mt-5 text-center">
            <Link href="/" className="text-sm text-gray-600 hover:text-gray-900">
              Back to Home
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6 text-sm text-gray-600">
          Loading sign-in...
        </div>
      }
    >
      <SignInPageContent />
    </Suspense>
  );
}
