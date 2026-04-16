"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Dashboard } from "@/components/Dashboard/Dashboard";
import { getActiveSession, startDemoSession, type BuilderProSession } from "@/lib/auth";

const HIGHLIGHTS = [
  { label: "Projects in motion", value: "3" },
  { label: "Quoted material value", value: "$7.1k" },
  { label: "Active suppliers", value: "5" },
  { label: "Live PO tracking", value: "2 shipments" },
];

export default function Home() {
  const router = useRouter();
  const [session, setSession] = useState<BuilderProSession | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isLaunchingDemo, setIsLaunchingDemo] = useState(false);
  const [demoError, setDemoError] = useState("");

  useEffect(() => {
    setSession(getActiveSession());
    setIsReady(true);
  }, []);

  if (!isReady) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6 text-sm text-gray-500">
        Loading BuilderPro...
      </div>
    );
  }

  if (session) {
    return <Dashboard />;
  }

  async function handleLaunchDemo() {
    setDemoError("");
    setIsLaunchingDemo(true);

    try {
      await startDemoSession();
      router.push("/");
      router.refresh();
    } catch (error) {
      setDemoError(error instanceof Error ? error.message : "Unable to launch the demo workspace.");
    } finally {
      setIsLaunchingDemo(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(249,115,22,0.18),_transparent_30%),linear-gradient(180deg,_#f8fafc_0%,_#fff7ed_100%)]">
      <div className="mx-auto max-w-6xl px-6 py-8 sm:px-8 lg:px-10">
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-2">
            <span className="text-2xl font-bold text-orange-500">Builder</span>
            <span className="text-2xl font-bold text-gray-900">Pro</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/signin" className="text-sm font-medium text-gray-700 hover:text-gray-900">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-full border border-orange-200 bg-white px-4 py-2 text-sm font-semibold text-orange-700 shadow-sm hover:border-orange-300 hover:bg-orange-50"
            >
              Create workspace
            </Link>
          </div>
        </div>

        <section className="grid gap-10 py-16 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div className="space-y-6">
            <div className="inline-flex rounded-full border border-orange-200 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-orange-700 shadow-sm">
              Construction Ops Demo
            </div>
            <div className="space-y-4">
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-gray-950 sm:text-5xl">
                Show a buyer a live estimating and purchasing workflow in under five minutes.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-gray-600">
                BuilderPro is set up with a seeded contractor workspace, active projects, live material catalog, and
                vendor purchasing activity so the first session feels like a working business instead of an empty app.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleLaunchDemo}
                disabled={isLaunchingDemo}
                className="inline-flex items-center rounded-full bg-gray-950 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-gray-950/10 transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLaunchingDemo ? "Launching demo..." : "Launch Interactive Demo"}
              </button>
              <Link
                href="/signin"
                className="inline-flex items-center rounded-full border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-800 shadow-sm transition hover:bg-gray-50"
              >
                Use Sign-In Screen
              </Link>
            </div>

            <p className="text-sm text-gray-500">
              Demo workspace includes dashboard metrics, projects, materials, customers, vendors, search, and order-tracking data.
            </p>
            {demoError && (
              <p className="max-w-xl rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {demoError}
              </p>
            )}
          </div>

          <div className="rounded-[28px] border border-white/70 bg-white/85 p-5 shadow-[0_25px_80px_-45px_rgba(15,23,42,0.45)] backdrop-blur">
            <div className="rounded-3xl bg-slate-950 p-5 text-white">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-orange-300">Demo Workspace</p>
                  <h2 className="mt-2 text-2xl font-semibold">Northwind Builders</h2>
                </div>
                <div className="rounded-full border border-emerald-400/30 bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-200">
                  Live local data
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                {HIGHLIGHTS.map((item) => (
                  <div key={item.label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-400">{item.label}</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{item.value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">Suggested buyer walkthrough</p>
                    <p className="mt-1 text-sm text-slate-300">Dashboard → Projects → Orders → Search</p>
                  </div>
                  <span className="rounded-full bg-orange-500 px-3 py-1 text-xs font-semibold text-white">5 min</span>
                </div>
                <div className="mt-4 space-y-3 text-sm text-slate-300">
                  <div className="flex items-center justify-between">
                    <span>Riverside Residence framing package</span>
                    <span className="text-orange-300">PO-24018</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Coastal Beach House plumbing rough-in</span>
                    <span className="text-amber-300">ETA Apr 18</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Summit Office remodel estimate</span>
                    <span className="text-emerald-300">$3.4k draft</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
