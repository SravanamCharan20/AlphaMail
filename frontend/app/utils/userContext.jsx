"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch } from "./api";

const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = async () => {
    try {
      const res = await apiFetch("/auth/me");
      if (!res.ok) {
        setUser(null);
        return;
      }
      const data = await res.json();
      setUser(data?.user ?? null);
    } catch (error) {
      console.warn("User fetch failed. Backend may be offline.", error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  const contextValue = useMemo(() => ({ user, setUser, loading }), [user, loading]);

  return (
    <UserContext.Provider value={contextValue}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);
