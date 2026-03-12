"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";
import { useUser } from "../utils/userContext";

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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#fff7ef_0%,_#f6f2ee_45%,_#efe7df_100%)]">
      <div className="px-4 sm:px-8 py-6">
        <Navbar />
      </div>
    </div>
  );
}

export default Dashboard
