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
      <div className="relative z-10 px-4 sm:px-10 pt-1">
        <Navbar />
        <EmailSidebar />
      </div>
    </div>
  );
}

export default Dashboard
