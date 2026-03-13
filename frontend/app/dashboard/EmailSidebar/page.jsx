"use client";
import React, { useState } from "react";
import EmailCards from "./components/EmailCards";

const EmailSidebar = () => {
  const [messages, setMessages] = useState([]);
  const [msgsCount, setMsgsCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const handleGetMsgs = async () => {
    try {
      setLoading(true);

      const res = await fetch("http://localhost:9000/gmail/messages", {
        credentials: "include",
      });

      const data = await res.json();

      setMessages(data.emails);
      setMsgsCount(data.count);

      setLoading(false);
    } catch (error) {
      console.log(error.message);
      setLoading(false);
    }
  };

  return (
    <div className="border p-2 m-2 mt-12 w-1/4 min-h-screen">
      <h1>Email Sidebar</h1>
      <h2>No of messages : {msgsCount}</h2>

      <button
        className="p-2 rounded-lg bg-blue-500/70"
        onClick={handleGetMsgs}
      >
        {loading ? "Loading..." : "Load Emails"}
      </button>

      <EmailCards msgs={messages} />
    </div>
  );
};

export default EmailSidebar;