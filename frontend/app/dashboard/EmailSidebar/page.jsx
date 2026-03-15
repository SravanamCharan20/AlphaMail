"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { FaSpinner } from "react-icons/fa";
import EmailCards from "./components/EmailCards";
import socket from "../../utils/socket";
import { apiFetch } from "../../utils/api";
import {
  dedupeEmails,
  mergeEmails,
  sortEmails,
} from "./emailUtils";
import { matchesFilters } from "./filterUtils";

const PAGE_SIZE = 5;

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

  const filtersRef = useRef({ account: "all", range: "all" });
  const lastFiltersRef = useRef({ account: "all", range: "all" });
  const pageRef = useRef(1);
  const fetchSeqRef = useRef(0);
  const fetchAbortRef = useRef(null);

  const tzOffset = useMemo(() => -new Date().getTimezoneOffset(), []);

  const updateRefs = () => {
    filtersRef.current = { account: accountFilter, range: dateRange };
    pageRef.current = page;
  };

  useEffect(updateRefs, [accountFilter, dateRange, page]);

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
        buildMessagesPath(accountFilter, dateRange, page, PAGE_SIZE),
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
      const uniqueEmails = dedupeEmails(emails);

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
  }, []);

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
  }, [accountFilter, dateRange, page]);

  useEffect(() => {
    setNewMailCount(0);
  }, [accountFilter, dateRange]);

  useEffect(() => {
    if (page === 1 && newMailCount !== 0) {
      setNewMailCount(0);
    }
  }, [page, newMailCount]);

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

      if (pageRef.current !== 1) {
        setNewMailCount((prev) => prev + 1);
        setTotal((prev) => (typeof prev === "number" ? prev + 1 : prev));
        return;
      }

      setMessages((prev) => {
        const merged = mergeEmails(prev, email);
        const sorted = sortEmails(merged);
        return sorted.slice(0, PAGE_SIZE);
      });

      setTotal((prev) => (typeof prev === "number" ? prev + 1 : prev));
    });

    socket.on("sync-complete", () => {
      setSyncing(false);
      if (pageRef.current === 1) {
        fetchMessages({ resetNew: true });
      }
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("sync-start");
      socket.off("email-added");
      socket.off("sync-complete");
    };
  }, []);

  const canPrev = page > 1;
  const fallbackNext =
    total ? page * PAGE_SIZE < total : messages.length === PAGE_SIZE;
  const canNext = hasNext !== null ? hasNext : fallbackNext;
  const startIndex = messages.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endIndex = total
    ? Math.min(page * PAGE_SIZE, total)
    : (page - 1) * PAGE_SIZE + messages.length;

  return (
    <div className="border p-3 m-2 mt-12 w-1/4 min-h-screen bg-white">
      <div className="flex justify-between items-center mb-3">
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

        <div className="flex items-center gap-2 text-xs">
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold ${
              syncing
                ? "bg-blue-50 text-blue-700"
                : "bg-emerald-50 text-emerald-700"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                syncing ? "bg-blue-500 animate-pulse" : "bg-emerald-500"
              }`}
            />
            {syncing ? "Syncing" : "Up to date"}
          </span>
          {syncing && <FaSpinner className="animate-spin text-blue-500" />}
        </div>
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
        <span>Emails: {total || messages.length}</span>
      </div>

      {newMailCount > 0 && page !== 1 && (
        <button
          type="button"
          onClick={handleRefresh}
          className="mb-3 w-full rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700"
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
        <EmailCards msgs={messages} />
      )}

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
