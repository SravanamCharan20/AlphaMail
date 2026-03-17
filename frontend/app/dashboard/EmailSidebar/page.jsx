"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { FaSpinner } from "react-icons/fa";
import { FiCalendar, FiChevronDown, FiInbox, FiMail } from "react-icons/fi";
import EmailCards from "./components/EmailCards";
import ThreadDetail from "./components/ThreadDetail";
import socket from "../../utils/socket";
import { apiFetch } from "../../utils/api";
import {
  dedupeEmails,
  mergeEmails,
  sortEmails,
  getEmailSignature,
  getThreadKey,
} from "./emailUtils";
import { matchesFilters } from "./filterUtils";

const EmailSidebar = () => {
  const [messages, setMessages] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [accountFilter, setAccountFilter] = useState("all");
  const [dateRange, setDateRange] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasNext, setHasNext] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [newMailCount, setNewMailCount] = useState(0);
  const [selectedThread, setSelectedThread] = useState(null);
  const [threadMessages, setThreadMessages] = useState([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState(null);
  const [readingMode, setReadingMode] = useState("clean");
  const [showDetails, setShowDetails] = useState(false);
  const [trustedSenders, setTrustedSenders] = useState([]);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [dateMenuOpen, setDateMenuOpen] = useState(false);
  const [newTagNow, setNewTagNow] = useState(Date.now());

  const filtersRef = useRef({ account: "all", range: "all" });
  const lastFiltersRef = useRef({ account: "all", range: "all" });
  const pageRef = useRef(1);
  const fetchSeqRef = useRef(0);
  const fetchAbortRef = useRef(null);
  const selectedThreadRef = useRef(null);
  const newTagMapRef = useRef(new Map());

  const tzOffset = useMemo(() => -new Date().getTimezoneOffset(), []);
  const pageSize = 5;
  const NEW_TAG_TTL_MS = 2 * 60 * 1000;

  const updateRefs = () => {
    filtersRef.current = { account: accountFilter, range: dateRange };
    pageRef.current = page;
  };

  useEffect(updateRefs, [accountFilter, dateRange, page]);

  useEffect(() => {
    selectedThreadRef.current = selectedThread;
  }, [selectedThread]);

  useEffect(() => {
    setReadingMode("clean");
    setShowDetails(false);
  }, [selectedThread?.threadId, selectedThread?.account]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      let changed = false;
      for (const [key, until] of newTagMapRef.current.entries()) {
        if (until <= now) {
          newTagMapRef.current.delete(key);
          changed = true;
        }
      }
      if (changed) {
        setNewTagNow(now);
      }
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  const buildMessagesPath = (account, range, pageNumber, pageLimit) => {
    const params = new URLSearchParams();

    if (account !== "all") {
      params.set("account", account);
    }
    if (range !== "all") {
      params.set("range", range);
    }

    params.set("page", String(pageNumber));
    params.set("limit", String(pageLimit));
    params.set("tzOffset", String(tzOffset));

    return `/gmail/messages?${params.toString()}`;
  };

  const fetchPreferences = async () => {
    try {
      const res = await apiFetch("/auth/preferences");
      if (!res.ok) {
        return;
      }
      const data = await res.json();
      setTrustedSenders(
        Array.isArray(data?.imageTrustedSenders)
          ? data.imageTrustedSenders
          : []
      );
    } catch (error) {
      console.warn("Failed to load preferences", error);
    }
  };

  const updatePreferences = async (payload) => {
    try {
      const res = await apiFetch("/auth/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        console.warn("Failed to update preferences");
        return null;
      }
      const data = await res.json();
      setTrustedSenders(
        Array.isArray(data?.imageTrustedSenders)
          ? data.imageTrustedSenders
          : []
      );
      return data;
    } catch (error) {
      console.warn("Failed to update preferences", error);
      return null;
    }
  };

  const updateThreadUnread = (thread, unread) => {
    if (!thread?.threadId) return;
    setMessages((prev) =>
      prev.map((mail) =>
        mail.threadId === thread.threadId && mail.account === thread.account
          ? { ...mail, isUnread: unread }
          : mail
      )
    );
    setSelectedThread((prev) =>
      prev &&
      prev.threadId === thread.threadId &&
      prev.account === thread.account
        ? { ...prev, isUnread: unread }
        : prev
    );
    setThreadMessages((prev) =>
      prev.map((msg) => ({ ...msg, isUnread: unread }))
    );
  };

  const updateReadState = async (thread, unread) => {
    if (!thread?.threadId || !thread?.account) return;
    try {
      const res = await apiFetch(
        `/gmail/threads/${thread.threadId}/read?account=${encodeURIComponent(
          thread.account
        )}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ unread }),
        }
      );
      if (!res.ok) {
        console.warn("Failed to update read state");
        return;
      }
      updateThreadUnread(thread, unread);
    } catch (error) {
      console.warn("Failed to update read state", error);
    }
  };

  const fetchThreadDetails = async (thread) => {
    if (!thread?.threadId || !thread?.account) return;
    setThreadLoading(true);
    setThreadError(null);
    try {
      const res = await apiFetch(
        `/gmail/threads/${thread.threadId}?account=${encodeURIComponent(
          thread.account
        )}`
      );
      if (!res.ok) {
        setThreadError("Failed to load conversation.");
        setThreadMessages([]);
        return;
      }
      const data = await res.json();
      const msgs = Array.isArray(data.messages) ? data.messages : [];
      setThreadMessages(msgs);
      setSelectedThread((prev) =>
        prev &&
        prev.threadId === thread.threadId &&
        prev.account === thread.account
          ? {
              ...prev,
              account: data.account || prev.account,
              isUnread: Boolean(data.isUnread),
              subject: prev.subject || msgs[0]?.subject,
              from: prev.from || msgs[0]?.from,
            }
          : prev
      );

      if (data.isUnread) {
        updateReadState(thread, false);
      }
    } catch (error) {
      console.warn("Failed to load thread", error);
      setThreadError("Failed to load conversation.");
    } finally {
      setThreadLoading(false);
    }
  };

  const fetchMessages = async (options = {}) => {
    const { resetNew = false } = options;
    const seq = fetchSeqRef.current + 1;
    fetchSeqRef.current = seq;
    if (fetchAbortRef.current) {
      fetchAbortRef.current.abort();
    }
    const controller = new AbortController();
    fetchAbortRef.current = controller;

    setLoading(true);
    setError(null);
    setHasNext(null);

    try {
      const res = await apiFetch(
        buildMessagesPath(accountFilter, dateRange, page, pageSize),
        { signal: controller.signal }
      );
      if (fetchSeqRef.current !== seq) return;
      if (!res.ok) {
        setError("Failed to load messages.");
        setLoading(false);
        return;
      }

      const data = await res.json();
      if (fetchSeqRef.current !== seq) return;
      const emails = Array.isArray(data.emails) ? data.emails : [];
      const uniqueEmails = dedupeEmails(emails).map((email) => {
        const newUntil = getNewUntil(email);
        if (email.syncSource === "incremental") {
          return { ...email, syncSource: "incremental", newUntil };
        }
        return newUntil ? { ...email, newUntil } : email;
      });

      setMessages(uniqueEmails);
      setTotal(typeof data.total === "number" ? data.total : emails.length);
      setHasNext(
        typeof data.hasNext === "boolean" ? data.hasNext : null
      );
      if (resetNew) setNewMailCount(0);
    } catch (err) {
      if (err?.name === "AbortError") return;
      console.log("Fetch error:", err?.message || err);
      setError("Failed to load messages.");
    } finally {
      if (fetchSeqRef.current === seq) {
        setLoading(false);
      }
    }
  };

  const fetchAccounts = async () => {
    try {
      const res = await apiFetch("/googleAuth/accounts");
      if (!res.ok) {
        setAccounts([]);
        return;
      }
      const data = await res.json();
      const list = Array.isArray(data.accounts) ? data.accounts : [];
      setAccounts(list);
      if (
        accountFilter !== "all" &&
        !list.some((account) => account.email === accountFilter)
      ) {
        setAccountFilter("all");
        setPage(1);
      }
    } catch (error) {
      console.warn("Failed to load accounts:", error);
      setAccounts([]);
    }
  };

  const handleRefresh = () => {
    if (page !== 1) {
      setPage(1);
      return;
    }
    fetchMessages({ resetNew: true });
  };

  useEffect(() => {
    fetchAccounts();
    fetchPreferences();
  }, []);

  useEffect(() => {
    if (!selectedThread) return;
    fetchThreadDetails(selectedThread);
  }, [selectedThread?.threadId, selectedThread?.account]);

  useEffect(() => {
    const handleAccountsUpdate = () => {
      fetchAccounts();
      if (pageRef.current !== 1) {
        setPage(1);
        return;
      }
      fetchMessages({ resetNew: true });
    };

    window.addEventListener("accounts-updated", handleAccountsUpdate);
    return () =>
      window.removeEventListener("accounts-updated", handleAccountsUpdate);
  }, []);

  useEffect(() => {
    const lastFilters = lastFiltersRef.current;
    const filtersChanged =
      lastFilters.account !== accountFilter ||
      lastFilters.range !== dateRange;

    if (filtersChanged) {
      lastFiltersRef.current = { account: accountFilter, range: dateRange };
      if (page !== 1) {
        setPage(1);
        return;
      }
    }

    fetchMessages();
  }, [accountFilter, dateRange, page, pageSize]);

  useEffect(() => {
    setNewMailCount(0);
  }, [accountFilter, dateRange]);

  useEffect(() => {
    setSelectedThread(null);
    setThreadMessages([]);
    setThreadError(null);
  }, [accountFilter, dateRange]);

  useEffect(() => {
    if (page === 1 && newMailCount !== 0) {
      setNewMailCount(0);
    }
  }, [page, newMailCount]);

  const handleSelectThread = (mail) => {
    if (!mail?.threadId || !mail?.account) return;
    const nextThread = {
      threadId: mail.threadId,
      account: mail.account,
      subject: mail.subject,
      from: mail.from,
      isUnread: mail.isUnread,
    };
    setSelectedThread(nextThread);
  };

  const handleTrustSender = async (sender) => {
    if (!sender) return;
    await updatePreferences({ addTrustedSender: sender });
  };

  const handleUntrustSender = async (sender) => {
    if (!sender) return;
    await updatePreferences({ removeTrustedSender: sender });
  };

  useEffect(() => {
    // Socket connection
    socket.on("connect", () => {
      console.log("Connected to socket:", socket.id);
    });

    socket.on("disconnect", () => {
      console.log("Socket disconnected");
    });

    socket.on("sync-start", () => {
      setSyncing(true);
    });

    socket.on("email-added", (email) => {
      const filters = filtersRef.current;
      if (!matchesFilters(email, filters)) {
        return;
      }

      const isIncremental =
        email?.isIncremental || email?.syncSource === "incremental";
      if (isIncremental) {
        markNewTag(email);
      }

      if (pageRef.current !== 1) {
        setNewMailCount((prev) => prev + 1);
        setTotal((prev) => (typeof prev === "number" ? prev + 1 : prev));
        return;
      }

      setMessages((prev) => {
        const newUntil = isIncremental ? getNewUntil(email) : null;
        const enrichedEmail = newUntil ? { ...email, newUntil } : email;
        const merged = mergeEmails(prev, enrichedEmail);
        const sorted = sortEmails(merged);
        const next = sorted.slice(0, pageSize);
        if (!isIncremental) return next;
        return next.map((item) =>
          item.threadId === email.threadId && item.account === email.account
            ? {
                ...item,
                syncSource: "incremental",
                newUntil,
              }
            : item
        );
      });

      setTotal((prev) => (typeof prev === "number" ? prev + 1 : prev));

      const activeThread = selectedThreadRef.current;
      if (
        activeThread &&
        email.threadId === activeThread.threadId &&
        email.account === activeThread.account
      ) {
        fetchThreadDetails(activeThread);
      }
    });

    socket.on("sync-complete", () => {
      setSyncing(false);
      if (pageRef.current === 1) {
        fetchMessages({ resetNew: true });
      }
    });

    socket.on("email-updated", (update) => {
      if (!update?.threadId || !update?.account) return;
      const thread = {
        threadId: update.threadId,
        account: update.account,
      };
      updateThreadUnread(thread, Boolean(update.isUnread));
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("sync-start");
      socket.off("email-added");
      socket.off("sync-complete");
      socket.off("email-updated");
    };
  }, []);

  const getNewKey = (email) => {
    if (!email) return "";
    const threadKey = getThreadKey(email);
    if (threadKey && threadKey !== "::") return threadKey;
    return getEmailSignature(email);
  };

  const markNewTag = (email) => {
    const key = getNewKey(email);
    if (!key) return null;
    const until = Date.now() + NEW_TAG_TTL_MS;
    newTagMapRef.current.set(key, until);
    setNewTagNow(Date.now());
    return until;
  };

  const getNewUntil = (email) => {
    const key = getNewKey(email);
    if (!key) return null;
    const until = newTagMapRef.current.get(key);
    if (!until) return null;
    if (until <= Date.now()) {
      newTagMapRef.current.delete(key);
      return null;
    }
    return until;
  };

  const canPrev = page > 1;
  const fallbackNext =
    total ? page * pageSize < total : messages.length === pageSize;
  const canNext = hasNext !== null ? hasNext : fallbackNext;
  const startIndex = messages.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIndex = total
    ? Math.min(page * pageSize, total)
    : (page - 1) * pageSize + messages.length;

  const selectedKey = selectedThread ? getThreadKey(selectedThread) : "";
  const accountLabel = accountFilter === "all" ? "All inbox" : accountFilter;
  const dateLabels = {
    all: "All time",
    today: "Today",
    yesterday: "Yesterday",
    week: "Last 7 days",
    month: "Last 30 days",
  };
  const dateLabel = dateLabels[dateRange] || "All time";
  const accountOptions = [
    { value: "all", label: "All inbox", type: "inbox" },
    ...accounts.map((account) => ({
      value: account.email,
      label: account.email,
      provider: account.provider || "Mail",
    })),
  ];
  const dateOptions = [
    { value: "all", label: "All time" },
    { value: "today", label: "Today" },
    { value: "yesterday", label: "Yesterday" },
    { value: "week", label: "Last 7 days" },
    { value: "month", label: "Last 30 days" },
  ];

  const handleAccountSelect = (value) => {
    setPage(1);
    setAccountFilter(value);
    setAccountMenuOpen(false);
  };

  const handleDateSelect = (value) => {
    setPage(1);
    setDateRange(value);
    setDateMenuOpen(false);
  };

  return (
    <>
      <div className="fixed left-4 sm:left-10 top-0 z-40 w-[calc(100%-2rem)] sm:w-[calc(100%-5rem)] lg:w-[300px] xl:w-[830px] 2xl:w-[460px]">
        <div className="rounded-b-[32px] border border-black/5 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(255,255,255,0.9)_100%)] px-4 py-3.5 backdrop-blur">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-[1.15rem] font-semibold text-gray-900">
              Inbox
            </h1>
            <div
              className="relative"
              tabIndex={0}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  setAccountMenuOpen(false);
                }
              }}
            >
              <button
                type="button"
                onClick={() =>
                  setAccountMenuOpen((prev) => {
                    const next = !prev;
                    if (next) {
                      setDateMenuOpen(false);
                    }
                    return next;
                  })
                }
                className="inline-flex items-center gap-2 rounded-full border border-black/5 bg-white/95 px-3.5 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition hover:bg-white"
                aria-haspopup="menu"
                aria-expanded={accountMenuOpen}
              >
                <span className="text-[9px] uppercase tracking-[0.18em] text-gray-400">
                  Account
                </span>
                <span className="max-w-[200px] truncate text-gray-700">
                  {accountLabel}
                </span>
                <FiChevronDown
                  className={`text-[14px] text-gray-500 transition ${
                    accountMenuOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              <div
                className={`absolute left-0 z-50 mt-2 w-64 origin-top-left rounded-2xl border border-black/5 bg-white p-2 shadow-[0_18px_40px_rgba(15,23,42,0.12)] transition-all duration-200 ${
                  accountMenuOpen
                    ? "scale-100 opacity-100"
                    : "pointer-events-none scale-95 opacity-0 -translate-y-1"
                }`}
                role="menu"
              >
                <div className="max-h-64 overflow-auto pr-1">
                  {accountOptions.map((option) => {
                    const isActive = accountFilter === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => handleAccountSelect(option.value)}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium transition ${
                          isActive
                            ? "bg-neutral-100 text-neutral-900"
                            : "text-neutral-700 hover:bg-neutral-50"
                        }`}
                        role="menuitem"
                      >
                        <span
                          className={`h-8 w-8 rounded-lg ${
                            isActive ? "bg-white" : "bg-neutral-100"
                          } grid place-items-center text-neutral-700`}
                        >
                          {option.type === "inbox" ? (
                            <FiInbox className="text-[15px]" />
                          ) : (
                            <FiMail className="text-[15px]" />
                          )}
                        </span>
                        <span className="flex-1 truncate">
                          {option.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div
              className="relative"
              tabIndex={0}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  setDateMenuOpen(false);
                }
              }}
            >
              <button
                type="button"
                onClick={() =>
                  setDateMenuOpen((prev) => {
                    const next = !prev;
                    if (next) {
                      setAccountMenuOpen(false);
                    }
                    return next;
                  })
                }
                className="inline-flex items-center gap-2 rounded-full border border-black/5 bg-white/95 px-3.5 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition hover:bg-white"
                aria-haspopup="menu"
                aria-expanded={dateMenuOpen}
              >
                <span className="text-[9px] uppercase tracking-[0.18em] text-gray-400">
                  Date
                </span>
                <span className="text-gray-700">{dateLabel}</span>
                <FiChevronDown
                  className={`text-[14px] text-gray-500 transition ${
                    dateMenuOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              <div
                className={`absolute left-0 z-50 mt-2 w-56 origin-top-left rounded-2xl border border-black/5 bg-white p-2 shadow-[0_18px_40px_rgba(15,23,42,0.12)] transition-all duration-200 ${
                  dateMenuOpen
                    ? "scale-100 opacity-100"
                    : "pointer-events-none scale-95 opacity-0 -translate-y-1"
                }`}
                role="menu"
              >
                <div className="space-y-1">
                  {dateOptions.map((option) => {
                    const isActive = dateRange === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => handleDateSelect(option.value)}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium transition ${
                          isActive
                            ? "bg-neutral-100 text-neutral-900"
                            : "text-neutral-700 hover:bg-neutral-50"
                        }`}
                        role="menuitem"
                      >
                        <span
                          className={`h-8 w-8 rounded-lg ${
                            isActive ? "bg-white" : "bg-neutral-100"
                          } grid place-items-center text-neutral-700`}
                        >
                          <FiCalendar className="text-[15px]" />
                        </span>
                        <span className="flex-1">{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="pt-6 grid min-h-0 gap-2 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[830px_minmax(0,1fr)] 2xl:grid-cols-[460px_minmax(0,1fr)] lg:h-[calc(100vh-10px)] lg:overflow-hidden">
        <div className="mt-[-20px] flex min-h-0 flex-col gap-3 pt-[110px] md:pt-[104px] lg:pt-[57px]">
          <div className="flex flex-1 min-h-0 flex-col rounded-[24px] border border-black/5 bg-white/90 px-4 py-4 shadow-[0_14px_30px_rgba(15,23,42,0.05)] backdrop-blur">
            <div className="mb-3 flex items-center justify-between gap-2 rounded-full border border-black/5 bg-white/95 px-3 py-1.5 text-xs font-semibold text-gray-600 shadow-sm">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${
                    syncing
                      ? "bg-[var(--accent)] animate-pulse"
                      : "bg-emerald-500"
                  }`}
                />
                <span>{syncing ? "Syncing" : "Up to date"}</span>
                {syncing && (
                  <FaSpinner className="animate-spin text-[color:var(--accent)]" />
                )}
              </div>
              <div className="flex items-center gap-1 text-gray-500">
                <span>Emails:</span>
                <span className="text-gray-700">
                  {total || messages.length}
                </span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto pr-1">
              {newMailCount > 0 && page !== 1 && (
                <button
                  type="button"
                  onClick={handleRefresh}
                  className="mb-3 w-full rounded-lg border border-[color:var(--accent-soft)] bg-[var(--accent-soft)] px-3 py-2 text-xs font-semibold text-[color:var(--accent)]"
                >
                  {newMailCount} new messages · Refresh
                </button>
              )}

              {error && (
                <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {error}
                </div>
              )}

              {loading ? (
                <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-6 text-xs text-gray-500">
                  Loading messages...
                </div>
              ) : messages.length === 0 ? (
                <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-6 text-xs text-gray-500">
                  No emails found for this filter.
                </div>
              ) : (
                <EmailCards
                  msgs={messages}
                  selectedKey={selectedKey}
                  onSelect={handleSelectThread}
                  now={newTagNow}
                />
              )}
            </div>

          <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
            <span>
              {total
                ? `Showing ${startIndex}-${endIndex} of ${total}`
                : `Showing ${startIndex}-${endIndex}`}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={!canPrev}
                className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                  canPrev
                    ? "border-black/5 text-gray-700 hover:bg-gray-50"
                    : "cursor-not-allowed border-black/5 text-gray-300"
                }`}
              >
                Prev
              </button>
              <span className="text-[11px] text-gray-400">Page {page}</span>
              <button
                type="button"
                onClick={() => setPage((prev) => prev + 1)}
                disabled={!canNext}
                className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                  canNext
                    ? "border-black/5 text-gray-700 hover:bg-gray-50"
                    : "cursor-not-allowed border-black/5 text-gray-300"
                }`}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-col gap-3">
        <div className="flex items-center justify-end">
          <div className="flex flex-wrap items-center gap-1 rounded-full border border-black/5 bg-white/90 px-1.5 py-0.5 text-[11px] font-semibold text-gray-600 shadow-sm">
            <button
              type="button"
              onClick={() => setReadingMode("clean")}
              className={`rounded-full px-2 py-0.5 transition ${
                readingMode === "clean"
                  ? "bg-[var(--accent)] text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              Clean
            </button>
            <button
              type="button"
              onClick={() => setReadingMode("raw")}
              className={`rounded-full px-2 py-0.5 transition ${
                readingMode === "raw"
                  ? "bg-[var(--accent)] text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              Raw
            </button>
            <span className="mx-1 h-4 w-px bg-black/10" />
            <button
              type="button"
              onClick={() =>
                selectedThread?.isUnread
                  ? updateReadState(selectedThread, false)
                  : updateReadState(selectedThread, true)
              }
              disabled={!selectedThread}
              className={`rounded-full px-2 py-0.5 transition ${
                selectedThread
                  ? "text-gray-600 hover:bg-gray-100"
                  : "cursor-not-allowed text-gray-300"
              }`}
            >
              {selectedThread?.isUnread ? "Read" : "Unread"}
            </button>
            <button
              type="button"
              onClick={() => setShowDetails((prev) => !prev)}
              disabled={!selectedThread}
              className={`rounded-full px-2 py-0.5 transition ${
                selectedThread
                  ? showDetails
                    ? "bg-[var(--accent-soft)] text-[color:var(--accent)]"
                    : "text-gray-600 hover:bg-gray-100"
                  : "cursor-not-allowed text-gray-300"
              }`}
            >
              Details
            </button>
          </div>
        </div>

        <ThreadDetail
          thread={selectedThread}
          messages={threadMessages}
          loading={threadLoading}
          error={threadError}
          onRetry={() => fetchThreadDetails(selectedThread)}
          trustedSenders={trustedSenders}
          onTrustSender={handleTrustSender}
          onUntrustSender={handleUntrustSender}
          readingMode={readingMode}
          showDetails={showDetails}
        />
      </div>
    </div>
    </>
  );
};

export default EmailSidebar;
