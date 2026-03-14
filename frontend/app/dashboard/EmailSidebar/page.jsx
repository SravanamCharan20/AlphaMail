"use client";

import React, { useEffect, useRef, useState } from "react";
import { FaSpinner } from "react-icons/fa";
import EmailCards from "./components/EmailCards";
import socket from "../../utils/socket";

const EmailSidebar = () => {
  const [messages, setMessages] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);

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

  // Fetch initial emails from DB
  const fetchMessages = async () => {
    try {
      const res = await fetch("http://localhost:9000/gmail/messages", {
        credentials: "include",
      });

      const data = await res.json();
      const uniqueEmails = dedupeEmails(data.emails || []);

      setMessages(uniqueEmails);
    } catch (error) {
      console.log("Fetch error:", error.message);
    }
  };

  // Trigger email sync
  const handleSync = async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);

    try {
      await fetch("http://localhost:9000/gmail/initial-sync", {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      syncingRef.current = false;
      setSyncing(false);
      console.log("Sync error:", error.message);
    }
  };

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
      setMessages((prev) => {
        const seen = new Set();
        prev.forEach((item) => {
          collectEmailKeys(item).forEach((key) => seen.add(key));
        });

        const keys = collectEmailKeys(email);
        const hasMatch = [...keys].some((key) => seen.has(key));

        if (hasMatch) return prev;

        return [email, ...prev];
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

  // Load cached emails when component mounts
  useEffect(() => {
    fetchMessages();
  }, []);

  return (
    <div className="border p-3 m-2 mt-12 w-1/4 min-h-screen bg-white">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="font-semibold text-lg">Inbox</h1>

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

      <p className="text-xs text-gray-500 mb-3">
        Emails: {messages.length}
      </p>

      <EmailCards msgs={messages} />
    </div>
  );
};

export default EmailSidebar;
