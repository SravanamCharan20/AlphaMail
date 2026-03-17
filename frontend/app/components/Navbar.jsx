"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  FiActivity,
  FiCheck,
  FiChevronDown,
  FiLogOut,
  FiMail,
  FiPlus,
  FiSearch,
  FiUser,
} from "react-icons/fi";
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

  const quickModeStyles = [
    "bg-white text-neutral-900 shadow-sm",
    "bg-emerald-400/15 text-emerald-200 hover:bg-emerald-400/25",
    "bg-amber-400/15 text-amber-200 hover:bg-amber-400/25",
  ];

  return (
    <nav className="fixed top-0 left-1/2 -translate-x-1/2 z-50">
      {toast && (
        <div className="fixed right-6 top-6 z-50 w-[280px] rounded-2xl border border-emerald-20 p-4 animate-[fadeUp_0.25s_ease-out]">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-emerald-100 text-emerald-700 grid place-items-center">
              <FiCheck className="text-[20px]" />
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

      <div className="relative w-[min(94vw,700px)] rounded-b-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,15,16,0.92)_0%,rgba(6,6,8,0.96)_100%)] ring-1 ring-white/5 backdrop-blur-2xl px-3.5 py-2.5 animate-[fadeUp_0.35s_ease-out]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="h-9 w-9 rounded-full border border-white/10 bg-white/10 text-white grid place-items-center shadow-sm"
              aria-label="AlphaMail home"
            >
              <FiActivity className="text-[18px]" />
            </button>
            <div className="hidden lg:flex items-center gap-1 rounded-full bg-white/5 p-1 border border-white/10">
              {["N", "D", "F"].map((label, idx) => (
                <button
                  key={label}
                  type="button"
                  className={
                    idx === 0
                      ? "h-7 w-7 rounded-lg bg-white text-neutral-900 text-xs font-semibold shadow-sm"
                      : "h-7 w-7 rounded-lg bg-white/10 text-white/70 text-xs font-semibold"
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="hidden md:flex flex-1 items-center justify-center">
            <div className="flex w-[220px] items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-white/60">
              <FiSearch className="text-[16px]" />
              <span className="text-[11px]">Search mail</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white/80 shadow-sm"
              aria-label="Filters"
            >
              <span className="hidden sm:inline">Filters</span>
              <span className="sm:hidden">⋯</span>
            </button>

            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-semibold text-white ring-1 ring-white/10"
            >
              AI
            </button>

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
                className="h-9 w-9 rounded-full cursor-pointer bg-white/10 text-white grid place-items-center text-xs font-semibold ring-1 ring-white/10"
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
                <div className="px-4 pt-4 pb-3 border-b border-neutral-100">
                  <p className="text-sm font-semibold text-neutral-800">
                    {user?.username ?? "Profile"}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {user?.email ?? "you@alphamail.com"}
                  </p>
                </div>
                <div className="p-2">
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-xl bg-neutral-100 px-3 py-2 text-left text-sm font-medium text-neutral-900"
                  >
                    <span className="h-8 w-8 rounded-lg bg-white shadow-sm grid place-items-center text-neutral-700">
                      <FiUser className="text-[16px]" />
                    </span>
                    Profile
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccountsOpen((prev) => !prev)}
                    className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                    aria-expanded={accountsOpen}
                  >
                    <span className="h-8 w-8 rounded-lg bg-neutral-100 grid place-items-center text-neutral-700">
                      <FiMail className="text-[16px]" />
                    </span>
                    <span className="flex-1">Accounts</span>
                    <FiChevronDown
                      className={`text-[14px] text-neutral-400 transition-transform ${
                        accountsOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  <div
                    className={`grid transition-all duration-200 ${
                      accountsOpen
                        ? "grid-rows-[1fr] opacity-100"
                        : "grid-rows-[0fr] opacity-0"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="px-3 pb-2 pt-2 space-y-2 max-h-48 overflow-auto pr-1">
                        {accounts.length > 0 ? (
                          accounts.map((account) => (
                            <div
                              key={
                                account._id ||
                                `${account.provider}-${account.email}`
                              }
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
                </div>
                <div className="border-t border-neutral-100 p-2">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    <span className="h-8 w-8 rounded-lg bg-red-50 grid place-items-center text-red-600">
                      <FiLogOut className="text-[16px]" />
                    </span>
                    Sign out
                  </button>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleConnectMail}
              className="h-9 w-9 rounded-full bg-[var(--accent)] text-white grid place-items-center shadow-[0_12px_26px_rgba(31,42,68,0.28)]"
              aria-label="Connect account"
            >
              <FiPlus className="text-[18px]" />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
