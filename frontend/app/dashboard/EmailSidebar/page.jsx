"use client";

import React, { useEffect, useState } from "react";
import { FaSpinner } from "react-icons/fa";
import EmailCards from "./components/EmailCards";
import socket from "../../utils/socket";

const EmailSidebar = () => {
  const [messages, setMessages] = useState([]);
  const [count, setCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const fetchMessages = async () => {
    const res = await fetch("http://localhost:9000/gmail/messages", {
      credentials: "include",
    });

    const data = await res.json();

    setMessages(data.emails);
    setCount(data.count);
  };

  const handleSync = async () => {
    try {
      setSyncing(true);

      await fetch("http://localhost:9000/gmail/initial-sync", {
        method: "POST",
        credentials: "include",
      });

      // start polling inbox
      const interval = setInterval(fetchMessages, 2000);

      // stop after 15 seconds
      setTimeout(() => {
        clearInterval(interval);
        setSyncing(false);
      }, 15000);
    } catch (error) {
      console.log(error.message);
      setSyncing(false);
    }
  };
  useEffect(() => {
    if (socket.connected) {
      console.log("Connected to socket:", socket.id);
    }

    socket.on("connect", () => {
      console.log("Connected to socket:", socket.id);
    });

    socket.on("disconnect", () => {
      console.log("Socket disconnected");
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
    };
  }, []);

  
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
