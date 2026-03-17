"use client";

import { useRouter, useSearchParams } from "next/navigation";
import React, { useState } from "react";
import Link from "next/link";
import { useUser } from "../../utils/userContext";
import { apiFetch } from "../../utils/api";


const Signin = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser } = useUser();

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    setLoading(true);
    try {
      const res = await apiFetch("/auth/signin", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });
      if (!res.ok) {
        throw new Error("Signin failed");
      }
      const data = await res.json();
      setUser(data.user);

      setEmail("");
      setPassword("");
      setSuccess(data.message);
      setLoading(false);

      const nextPath = searchParams.get("next");
      const safeNext =
        nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")
          ? nextPath
          : "/dashboard";
      router.push(safeNext);
    } catch (error) {
      console.log("Error:", error.message);
      setError("Something went wrong!!");
      setLoading(false);
    }
  };
  return (
    <div className="relative min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-5 sm:px-10 py-12">
        <div className="w-full max-w-[420px]">
          <div className="surface-strong rounded-[28px] px-6 py-7 sm:px-7">
            <div className="mb-6">
              <Link
                href="/"
                className="text-[11px] font-semibold text-[color:var(--muted)] hover:text-[color:var(--ink)]"
              >
                ← Back to AlphaMail
              </Link>
              <h1 className="mt-4 font-display text-[1.45rem] font-semibold tracking-tight text-[color:var(--ink)]">
                Welcome back
              </h1>
              <p className="mt-2 text-sm text-[color:var(--muted)]">
                Sign in to continue to your inbox.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1.5 text-left">
                <label className="text-[11px] font-semibold text-[color:var(--muted)]">
                  Email
                </label>
                <input
                  type="email"
                  autoComplete="email"
                  onChange={(e) => setEmail(e.target.value)}
                  value={email}
                  placeholder="you@company.com"
                  className="w-full rounded-2xl border border-black/10 bg-white/90 px-4 py-3 text-sm text-[color:var(--ink)] shadow-sm outline-none transition focus:border-[color:var(--accent)]/40 focus:ring-4 focus:ring-[color:var(--accent)]/10"
                />
              </div>

              <div className="space-y-1.5 text-left">
                <label className="text-[11px] font-semibold text-[color:var(--muted)]">
                  Password
                </label>
                <input
                  type="password"
                  autoComplete="current-password"
                  onChange={(e) => setPassword(e.target.value)}
                  value={password}
                  placeholder="••••••••"
                  className="w-full rounded-2xl border border-black/10 bg-white/90 px-4 py-3 text-sm text-[color:var(--ink)] shadow-sm outline-none transition focus:border-[color:var(--accent)]/40 focus:ring-4 focus:ring-[color:var(--accent)]/10"
                />
              </div>

              {success ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {success}
                </div>
              ) : null}
              {error ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              ) : null}

              <button
                disabled={loading}
                type="submit"
                className="mt-2 inline-flex w-full items-center justify-center rounded-2xl bg-[color:var(--accent)] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(10,132,255,0.20)] interactive disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>

            <p className="mt-5 text-center text-xs text-[color:var(--muted)]">
              New here?{" "}
              <Link
                href="/auth/signup"
                className="font-semibold text-[color:var(--accent)] hover:underline"
              >
                Create an account
              </Link>
            </p>
          </div>
          <p className="mt-4 text-center text-[11px] text-[color:var(--muted)]">
            A calm, premium inbox experience.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Signin;
