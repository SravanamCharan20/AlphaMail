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
    <div>
      <Navbar/>
    </div>
  )
}

export default Dashboard
