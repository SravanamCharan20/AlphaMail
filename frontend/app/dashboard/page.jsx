"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";
import { useUser } from "../utils/userContext";
import EmailSidebar from "./EmailSidebar/page";

const Dashboard = () => {
  const router = useRouter();
  const { user, loading } = useUser();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth/signin");
    }
  }, [loading, user, router]);

  if (loading || !user) return null;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--canvas)]">
      <div className="pointer-events-none absolute -top-44 right-[-14%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_top,#efe7dd_0%,#f6f2ed_50%,rgba(255,255,255,0)_72%)] opacity-60 blur-[140px]" />
      <div className="pointer-events-none absolute top-1/3 left-[-16%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_top,#dfe6f1_0%,#f1f5fb_50%,rgba(255,255,255,0)_70%)] opacity-55 blur-[150px]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.8)_0%,rgba(255,255,255,0)_30%,rgba(255,255,255,0.85)_100%)] opacity-45" />
      <div className="relative z-10 px-4 sm:px-10 pt-1">
        <Navbar />
        <EmailSidebar />
      </div>
    </div>
  );
}

export default Dashboard
