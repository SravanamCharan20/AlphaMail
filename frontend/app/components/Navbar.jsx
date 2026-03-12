"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useUser } from "../utils/userContext";

const Navbar = () => {
  const { user, loading } = useUser();
  const [open, setOpen] = useState(false);

  const initials = useMemo(() => {
    if (!user?.username) return "U";
    return user.username
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("");
  }, [user]);

  const handleLogout = async () => {
    try {
      const res = await fetch("http://localhost:9000/auth/logout", {
        method: "POST", // important
        credentials: "include", // sends cookies
      });

      window.location.reload();
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  if (loading && !user) return null;

  return (
    <nav className="w-full">
      <div className="mx-auto max-w-6xl rounded-2xl bg-white/90 shadow-[0_10px_30px_rgba(0,0,0,0.08)] backdrop-blur px-4 py-3 sm:px-6 animate-[fadeUp_0.35s_ease-out]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="h-11 w-11 rounded-full border border-neutral-200 bg-white grid place-items-center shadow-sm"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 12h4l2-6 4 12 2-6h4" />
              </svg>
            </button>

            <div className="flex items-center gap-1 rounded-full bg-neutral-100 p-1">
              {["N", "D", "F"].map((label, idx) => (
                <button
                  key={label}
                  type="button"
                  className={
                    idx === 0
                      ? "h-8 w-8 rounded-lg bg-blue-600 text-white text-sm font-semibold shadow-sm"
                      : "h-8 w-8 rounded-lg bg-white text-neutral-600 text-sm font-semibold"
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[220px] flex items-center gap-2 rounded-full bg-neutral-100 px-4 py-2 text-neutral-500">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <span className="text-xs sm:text-sm">
                Semantic search across mail, tasks, and people
              </span>
            </div>

            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm"
            >
              Filters
            </button>

            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 ring-1 ring-blue-100"
            >
              AI
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div
              className="relative"
              tabIndex={0}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
              }}
            >
              <button
                type="button"
                onClick={() => setOpen((prev) => !prev)}
                className="h-11 w-11 rounded-full bg-neutral-100 text-neutral-700 grid place-items-center font-semibold ring-1 ring-neutral-200"
                aria-haspopup="menu"
                aria-expanded={open}
              >
                {initials}
              </button>

              <div
                className={`absolute right-0 mt-3 w-56 origin-top-right rounded-2xl border border-neutral-200 bg-white shadow-[0_16px_40px_rgba(0,0,0,0.12)] transition-all duration-200 ${
                  open
                    ? "scale-100 opacity-100 translate-y-0"
                    : "pointer-events-none scale-95 opacity-0 -translate-y-1"
                }`}
              >
                <div className="px-4 pt-4 pb-3">
                  <p className="text-sm font-semibold text-neutral-800">
                    {user?.username ?? "Profile"}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {user?.email ?? "you@alphamail.com"}
                  </p>
                </div>
                <div className="border-t border-neutral-100 py-2">
                  <button
                    type="button"
                    className="w-full px-4 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                  >
                    View profile
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                  >
                    Logout
                  </button>
                </div>
              </div>
            </div>

            <button
              type="button"
              className="h-11 w-11 rounded-full bg-blue-600 text-white grid place-items-center shadow-md shadow-blue-200"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
