"use client";

import Link from "next/link";
import { useUser } from "../utils/userContext";

const Navbar = () => {
  const { user, setUser, loading } = useUser();

  const handleLogout = async () => {
    await fetch("http://localhost:9000/auth/logout", {
      method: "POST",
      credentials: "include",
    });

    setUser(null);
  };

  if (loading && !user) return null;

  return (
    <nav className="flex justify-between items-center px-8 py-4 bg-black text-white">
      <Link href="/" className="text-xl font-bold">
        SigmaMail
      </Link>

      <div className="flex items-center gap-4">
        {!user ? (
          <>
            <Link
              href="/auth/signin"
              className="px-4 py-2 border border-white rounded hover:bg-white hover:text-black transition"
            >
              Sign In
            </Link>

            <Link
              href="/auth/signup"
              className="px-4 py-2 bg-blue-500 rounded hover:bg-blue-600 transition"
            >
              Sign Up
            </Link>
          </>
        ) : (
          <>
            <p>Welcome {user.username}</p>

            <Link
              href="/dashboard"
              className="px-4 py-2 border border-white rounded hover:bg-white hover:text-black transition"
            >
              Dashboard
            </Link>

            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-500 rounded hover:bg-red-600 transition"
            >
              Logout
            </button>
          </>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
