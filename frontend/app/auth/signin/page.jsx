"use client";

import { useRouter, useSearchParams } from "next/navigation";
import React, { useState } from "react";
import Link from "next/link";
import { useUser } from "../../utils/userContext";
import { apiFetch } from "../../utils/api";


const Signin = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const {setUser} = useUser();

  const handleSubmit = async (e) => {
    setLoading(true);
    try {
      const res = await apiFetch("/auth/signin", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });
      if (!res.ok) {
        throw new Error("Signin failed");
      }
      const data = await res.json();
      setUser(data.user);

      setEmail("");
      setPassword("");
      setSuccess(data.message);
      setLoading(false);

      const nextPath = searchParams.get("next");
      const safeNext =
        nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")
          ? nextPath
          : "/dashboard";
      router.push(safeNext);
    } catch (error) {
      console.log("Error:", error.message);
      setError("Something went wrong!!");
      setLoading(false);
    }
  };
  return (
    <div className="flex flex-col mx-auto text-center w-1/3 m-2 border border-amber-200">
      <label>email</label>
      <input
        type="text"
        onChange={(e) => setEmail(e.target.value)}
        value={email}
        className="border w-1/2 mx-auto p-2 m-2"
      />
      <label>password</label>
      <input
        type="text"
        onChange={(e) => setPassword(e.target.value)}
        value={password}
        className="border w-1/2 mx-auto p-2 m-2"
      />
      <button
        disabled={loading}
        onClick={handleSubmit}
        className="rounded-lg p-2 bg-blue-300 w-1/3 mx-auto m-2 cursor-pointer hover:bg-blue-400"
      >
        {loading ? "loading .." : "submit"}
      </button>
      <h3>dont have an account? <Link href='/auth/signup'>Signup</Link></h3>
      {success && <p className="text-green-500">{success}</p>}
      {error && <p className="text-red-500">{error}</p>}
    </div>
  );
};

export default Signin;
