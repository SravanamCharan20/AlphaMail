"use client";

import React, { useEffect, useState } from "react";
import { FaSpinner } from "react-icons/fa";
import EmailCards from "./components/EmailCards";
import socket from "../../utils/socket";

const EmailSidebar = () => {
  const [messages, setMessages] = useState([]);
  const [count, setCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  // Fetch initial emails from DB
  const fetchMessages = async () => {
    try {
      const res = await fetch("http://localhost:9000/gmail/messages", {
        credentials: "include",
      });

      const data = await res.json();

      setMessages(data.emails);
      setCount(data.count);
    } catch (error) {
      console.log("Fetch error:", error.message);
    }
  };

  // Trigger email sync
  const handleSync = async () => {
    try {
      await fetch("http://localhost:9000/gmail/initial-sync", {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
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
      setSyncing(true);
    });

    // New email received
    socket.on("email-added", (email) => {
      setMessages((prev) => [email, ...prev]);

      setCount((prev) => prev + 1);
    });

    // Sync completed
    socket.on("sync-complete", () => {
      setSyncing(false);
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

      <p className="text-xs text-gray-500 mb-3">Emails: {count}</p>

      <EmailCards msgs={messages} />
    </div>
  );
};

export default EmailSidebar;
