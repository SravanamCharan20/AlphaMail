"use client";

import React, { useEffect, useRef, useState } from "react";
import { FaSpinner } from "react-icons/fa";
import EmailCards from "./components/EmailCards";
import socket from "../../utils/socket";
import { apiFetch } from "../../utils/api";

const EmailSidebar = () => {
  const [messages, setMessages] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);
  const [accounts, setAccounts] = useState([]);
  const [accountFilter, setAccountFilter] = useState("all");
  const [dateRange, setDateRange] = useState("all");
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(null);
  const accountFilterRef = useRef("all");
  const dateRangeRef = useRef("all");
  const pageRef = useRef(1);

  const getEmailSignature = (email) => {
    if (!email) return "unknown";

    const account = email.account ?? "";
    const subject = email.subject ?? "";
    const from = email.from ?? "";
    const date = email.date ?? "";
    const snippet = email.snippet ?? "";

    return `sig:${account}|${subject}|${from}|${date}|${snippet}`;
  };

  const collectEmailKeys = (email) => {
    const keys = new Set();
    keys.add(getEmailSignature(email));

    if (email?.threadId) {
      keys.add(`thread:${email.threadId}`);
    }

    return keys;
  };

  const dedupeEmails = (emails) => {
    const seen = new Set();
    const unique = [];

    for (const email of emails) {
      const keys = collectEmailKeys(email);
      const hasMatch = [...keys].some((key) => seen.has(key));

      if (hasMatch) continue;

      keys.forEach((key) => seen.add(key));
      unique.push(email);
    }

    return unique;
  };

  const getEmailTimestamp = (email) => {
    const candidate = email?.receivedAt || email?.date;
    if (!candidate) return 0;
    const parsed = new Date(candidate);
    const value = parsed.getTime();
    return Number.isNaN(value) ? 0 : value;
  };

  const sortEmails = (emails) =>
    [...emails].sort((a, b) => getEmailTimestamp(b) - getEmailTimestamp(a));

  const buildMessagesPath = (account, range, pageNumber, pageLimit) => {
    const params = new URLSearchParams();

    if (account !== "all") {
      params.set("account", account);
    }
    if (range !== "all") {
      params.set("range", range);
    }
    if (pageNumber) {
      params.set("page", pageNumber);
    }
    if (pageLimit) {
      params.set("limit", pageLimit);
    }
    const query = params.toString();
    return query ? `/gmail/messages?${query}` : "/gmail/messages";
  };

  // Fetch initial emails from DB
  const fetchMessages = async () => {
    try {
      const res = await apiFetch(
        buildMessagesPath(accountFilter, dateRange, page, limit)
      );
      const data = await res.json();
      const filteredEmails = (data.emails || []).filter((email) =>
        passesFilters(email, accountFilter, dateRange)
      );
      const uniqueEmails = dedupeEmails(filteredEmails);
      const sortedEmails = sortEmails(uniqueEmails);

      setMessages(sortedEmails);
      setTotal(typeof data.total === "number" ? data.total : null);
    } catch (error) {
      console.log("Fetch error:", error.message);
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
        setPage(1);
        setAccountFilter("all");
      }
    } catch (error) {
      console.warn("Failed to load accounts:", error);
      setAccounts([]);
    }
  };

  const getDateRangeBounds = (range) => {
    const now = new Date();
    const startOfDay = (date) =>
      new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const endOfDay = (date) =>
      new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        23,
        59,
        59,
        999
      );

    if (range === "today") {
      return { start: startOfDay(now), end: endOfDay(now) };
    }

    if (range === "yesterday") {
      const y = new Date(now);
      y.setDate(now.getDate() - 1);
      return { start: startOfDay(y), end: endOfDay(y) };
    }

    if (range === "week") {
      const start = new Date(now);
      start.setDate(now.getDate() - 6);
      return { start: startOfDay(start), end: now };
    }

    if (range === "month") {
      const start = new Date(now);
      start.setDate(now.getDate() - 29);
      return { start: startOfDay(start), end: now };
    }

    return null;
  };

  const passesFilters = (email, activeAccount, activeRange) => {
    if (activeAccount !== "all" && email?.account !== activeAccount) {
      return false;
    }

    if (activeRange === "all") return true;

    const candidate = email?.receivedAt || email?.date;
    const parsed = candidate ? new Date(candidate) : null;

    if (!parsed || Number.isNaN(parsed.getTime())) {
      return false;
    }

    const bounds = getDateRangeBounds(activeRange);
    if (!bounds) return true;

    return parsed >= bounds.start && parsed <= bounds.end;
  };

  const passesActiveFilters = (email) =>
    passesFilters(email, accountFilterRef.current, dateRangeRef.current);

  // Trigger email sync
  const handleSync = async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);

    try {
      await apiFetch("/gmail/initial-sync", {
        method: "POST",
      });
    } catch (error) {
      syncingRef.current = false;
      setSyncing(false);
      console.log("Sync error:", error.message);
    }
  };

  useEffect(() => {
    accountFilterRef.current = accountFilter;
  }, [accountFilter]);

  useEffect(() => {
    dateRangeRef.current = dateRange;
  }, [dateRange]);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  useEffect(() => {
    // Socket connection
    if (socket.connected) {
      console.log("Connected to socket:", socket.id);
    }

    socket.on("connect", () => {
      console.log("Connected to socket:", socket.id);
    });

    socket.on("disconnect", () => {
      console.log("Socket disconnected");
    });

    // Worker started syncing
    socket.on("sync-start", () => {
      syncingRef.current = true;
      setSyncing(true);
    });

    // New email received
    socket.on("email-added", (email) => {
      if (!passesActiveFilters(email)) {
        return;
      }
      if (pageRef.current !== 1) {
        return;
      }

      setMessages((prev) => {
        const seen = new Set();
        prev.forEach((item) => {
          collectEmailKeys(item).forEach((key) => seen.add(key));
        });

        const keys = collectEmailKeys(email);
        const hasMatch = [...keys].some((key) => seen.has(key));

        if (hasMatch) return prev;

        const next = sortEmails([email, ...prev]);
        return next.slice(0, limit);
      });
    });

    // Sync completed
    socket.on("sync-complete", () => {
      syncingRef.current = false;
      setSyncing(false);
      fetchMessages();
    });

    // Cleanup listeners
    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("sync-start");
      socket.off("email-added");
      socket.off("sync-complete");
    };
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    fetchMessages();
  }, [accountFilter, dateRange, page]);

  const canPrev = page > 1;
  const canNext = total !== null ? page * limit < total : messages.length === limit;
  const startIndex =
    messages.length === 0 ? 0 : (page - 1) * limit + 1;
  const endIndex =
    total !== null
      ? Math.min(page * limit, total)
      : (page - 1) * limit + messages.length;

  return (
    <div className="border p-3 m-2 mt-12 w-1/4 min-h-screen bg-white">
      {/* Header */}
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          <h1 className="font-semibold text-lg">Inbox</h1>
          <div className="relative">
            <select
              value={accountFilter}
              onChange={(event) => {
                setPage(1);
                setAccountFilter(event.target.value);
              }}
              className="appearance-none rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="all">All inbox</option>
              {accounts.map((account) => (
                <option
                  key={account._id || `${account.provider}-${account.email}`}
                  value={account.email}
                >
                  {account.email}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-500">
              ▾
            </span>
          </div>
        </div>

        <button
          onClick={handleSync}
          disabled={syncing}
          className={`flex items-center gap-2 px-3 py-1 rounded-md text-white transition
          ${
            syncing
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-blue-500 hover:bg-blue-600"
          }`}
        >
          {syncing && <FaSpinner className="animate-spin" />}

          {syncing ? "Syncing..." : "Sync"}
        </button>
      </div>

      <div className="mb-3 flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-2">
          <span className="text-gray-500">Date</span>
          <div className="relative">
            <select
              value={dateRange}
              onChange={(event) => {
                setPage(1);
                setDateRange(event.target.value);
              }}
              className="appearance-none rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="all">All time</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="week">Last 7 days</option>
              <option value="month">Last 30 days</option>
            </select>
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-500">
              ▾
            </span>
          </div>
        </div>
        <span>Emails: {messages.length}</span>
      </div>

      <EmailCards msgs={messages} />

      <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
        <span>
          {total !== null
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
                ? "border-gray-200 text-gray-700 hover:bg-gray-50"
                : "cursor-not-allowed border-gray-100 text-gray-300"
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
                ? "border-gray-200 text-gray-700 hover:bg-gray-50"
                : "cursor-not-allowed border-gray-100 text-gray-300"
            }`}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmailSidebar;
