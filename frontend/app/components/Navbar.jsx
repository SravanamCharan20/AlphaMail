"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useUser } from "../utils/userContext";
import { API_BASE, apiFetch } from "../utils/api";

const Navbar = () => {
  const { user, loading } = useUser();
  const [open, setOpen] = useState(false);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [toast, setToast] = useState(null);

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
      const res = await apiFetch("/auth/logout", {
        method: "POST", // important
      });

      window.location.reload();
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const notifyAccountsUpdated = () => {
    window.dispatchEvent(new CustomEvent("accounts-updated"));
  };

  const handleConnectMail = () => {
    const url = `${API_BASE}/googleAuth/google`;
    window.open(url, "_blank", "width=800,height=700");
  };

  const fetchAccounts = async () => {
    try {
      const res = await apiFetch("/googleAuth/accounts");
      if (!res.ok) {
        setAccounts([]);
        return;
      }
      const data = await res.json();
      setAccounts(Array.isArray(data.accounts) ? data.accounts : []);
    } catch (error) {
      console.warn("Failed to load accounts:", error);
      setAccounts([]);
    }
  };

  const handleDisconnectAccount = async (account) => {
    if (!account?._id) return;
    const confirmed = window.confirm(
      `Disconnect ${account.email}? This will remove its emails from your inbox.`
    );
    if (!confirmed) return;

    try {
      const res = await apiFetch(`/googleAuth/accounts/${account._id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setToast({
          title: "Disconnect failed",
          message: "Please try again.",
        });
        return;
      }

      setAccounts((prev) => prev.filter((item) => item._id !== account._id));
      setToast({
        title: "Account disconnected",
        message: account.email,
      });
      notifyAccountsUpdated();
    } catch (error) {
      console.warn("Failed to disconnect account:", error);
      setToast({
        title: "Disconnect failed",
        message: "Please try again.",
      });
    }
  };

  useEffect(() => {
    if (loading || !user) return;
    fetchAccounts().finally(() => notifyAccountsUpdated());
  }, [loading, user]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3800);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const handleMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "oauth-success") return;
      const provider = event.data?.provider || "gmail";
      const email = event.data?.email || "";
      setToast({
        title: "Account connected",
        message: email
          ? `${email} linked successfully.`
          : `${provider} linked successfully.`,
      });
      fetchAccounts().finally(() => notifyAccountsUpdated());
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);
  
  if (loading && !user) return null;

  return (
    <nav className="w-full">
      <div className="mx-auto max-w-7xl rounded-[26px] border border-black/5 bg-white/85 shadow-[0_14px_38px_rgba(15,23,42,0.08)] backdrop-blur px-4 py-3 sm:px-6 animate-[fadeUp_0.35s_ease-out]">
        {toast && (
          <div className="fixed right-6 top-6 z-50 w-[280px] rounded-2xl border border-emerald-200 bg-white shadow-[0_18px_50px_rgba(0,0,0,0.16)] p-4 animate-[fadeUp_0.25s_ease-out]">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-emerald-100 text-emerald-700 grid place-items-center">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-neutral-900">
                  {toast.title}
                </p>
                <p className="text-xs text-neutral-500">{toast.message}</p>
              </div>
              <button
                type="button"
                onClick={() => setToast(null)}
                className="ml-auto text-neutral-400 hover:text-neutral-700"
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="h-11 w-11 rounded-full border border-black/5 bg-white grid place-items-center shadow-sm"
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
              <div className="hidden sm:flex flex-col leading-tight">
                <span className="font-display text-sm font-semibold text-neutral-900">
                  AlphaMail
                </span>
                <span className="text-[11px] text-neutral-500">
                  Focused inbox
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1 rounded-full bg-neutral-100/80 p-1 border border-black/5">
              {["N", "D", "F"].map((label, idx) => (
                <button
                  key={label}
                  type="button"
                  className={
                    idx === 0
                      ? "h-8 w-8 rounded-lg bg-[var(--accent)] text-white text-sm font-semibold shadow-sm"
                      : "h-8 w-8 rounded-lg bg-white text-neutral-600 text-sm font-semibold"
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[220px] flex items-center gap-2 rounded-full border border-black/5 bg-neutral-50/80 px-4 py-2 text-neutral-500">
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
              className="inline-flex items-center gap-2 rounded-full border border-black/5 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm"
            >
              Filters
            </button>

            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-soft)] px-4 py-2 text-sm font-medium text-[color:var(--accent)] ring-1 ring-[color:var(--accent-soft)]"
            >
              AI
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div
              className="relative"
              tabIndex={0}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) {
                  setOpen(false);
                  setAccountsOpen(false);
                }
              }}
            >
              <button
                type="button"
                onClick={() => setOpen((prev) => !prev)}
                className="h-11 w-11 rounded-full cursor-pointer bg-neutral-100/80 text-neutral-700 grid place-items-center font-semibold ring-1 ring-black/5"
                aria-haspopup="menu"
                aria-expanded={open}
              >
                {initials}
              </button>

              <div
                className={`absolute right-0 mt-3 w-64 origin-top-right rounded-2xl border border-black/5 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.12)] transition-all duration-200 ${
                  open
                    ? "scale-100 opacity-100 cursor-pointer translate-y-0"
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
                    className="w-full px-4 py-2 text-left cursor-pointer text-sm text-neutral-700 hover:bg-neutral-50"
                  >
                    View profile
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccountsOpen((prev) => !prev)}
                    className="w-full px-4 py-2 text-left cursor-pointer text-sm text-neutral-700 hover:bg-neutral-50 flex items-center justify-between"
                    aria-expanded={accountsOpen}
                  >
                    Accounts
                    <span
                      className={`text-neutral-400 transition-transform ${
                        accountsOpen ? "rotate-180" : ""
                      }`}
                    >
                      ▾
                    </span>
                  </button>
                  <div
                    className={`grid transition-all duration-200 ${
                      accountsOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="px-4 pb-3 pt-1 space-y-2 max-h-48 overflow-auto pr-1">
                        {accounts.length > 0 ? (
                          accounts.map((account) => (
                            <div
                              key={account._id || `${account.provider}-${account.email}`}
                              className="flex items-center gap-3 rounded-xl border border-neutral-100 bg-neutral-50 px-3 py-2"
                            >
                            <div className="h-8 w-8 rounded-lg bg-[var(--accent-soft)] text-[color:var(--accent)] grid place-items-center text-xs font-semibold">
                              {(account.provider || "G")
                                .toUpperCase()
                                .slice(0, 1)}
                            </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold text-neutral-800 truncate">
                                  {account.provider === "gmail"
                                    ? "Gmail"
                                    : account.provider}
                                </p>
                                <p className="text-[11px] text-neutral-500 truncate">
                                  {account.email}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDisconnectAccount(account)}
                                className="rounded-full border border-neutral-200 bg-white px-2 py-1 text-[10px] font-semibold text-neutral-600 hover:bg-neutral-100"
                              >
                                Disconnect
                              </button>
                            </div>
                          ))
                        ) : (
                          <div className="text-xs text-neutral-500">
                            No accounts connected yet.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full px-4 py-2 cursor-pointer text-left text-sm text-red-600 hover:bg-red-50"
                  >
                    Logout
                  </button>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleConnectMail}
              className="h-11 w-11 rounded-full bg-[var(--accent)] text-white grid place-items-center shadow-[0_12px_26px_rgba(31,42,68,0.28)]"
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
