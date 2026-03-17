import Link from "next/link";
import React from "react";

const EntryPage = () => {
  return (
    <div className="relative min-h-[calc(100vh-0px)] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-60" />
      <div className="relative mx-auto w-full max-w-6xl px-5 sm:px-10 pt-16 pb-14">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-black/5 bg-white/80 px-4 py-2 text-[11px] font-semibold text-[color:var(--muted)] shadow-sm backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-[color:var(--accent)]" />
            AlphaMail
          </div>

          <h1 className="mt-8 text-balance font-display text-[2.35rem] leading-[1.05] tracking-tight text-[color:var(--ink)] sm:text-[3.2rem]">
            Email, refined.
          </h1>
          <p className="mt-5 text-balance text-[15px] leading-relaxed text-[color:var(--muted)] sm:text-[16px]">
            A clean inbox with thoughtful spacing, subtle depth, and a calm UI
            that stays out of your way.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/auth/signin"
              className="inline-flex w-full items-center justify-center rounded-full bg-black px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_50px_rgba(0,0,0,0.18)] transition hover:translate-y-[-1px] hover:shadow-[0_22px_60px_rgba(0,0,0,0.22)] sm:w-auto"
            >
              Sign in
            </Link>
            <Link
              href="/auth/signup"
              className="inline-flex w-full items-center justify-center rounded-full border border-black/10 bg-white/70 px-6 py-3 text-sm font-semibold text-[color:var(--ink)] shadow-sm backdrop-blur transition hover:bg-white sm:w-auto"
            >
              Create account
            </Link>
          </div>

          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            {[
              {
                title: "Spacious by default",
                body: "A comfortable rhythm of whitespace and clear hierarchy.",
              },
              {
                title: "Clean reading mode",
                body: "Strips noisy email HTML so the message is the hero.",
              },
              {
                title: "Calm by design",
                body: "Neutral tones, subtle depth, and a focused UI.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="surface rounded-[var(--r-lg)] px-5 py-5 text-left"
              >
                <p className="text-sm font-semibold text-[color:var(--ink)]">
                  {item.title}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-[color:var(--muted)]">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EntryPage;
