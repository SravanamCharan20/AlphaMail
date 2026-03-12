"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "../../utils/api";

const Signup = () => {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const router = useRouter();

  const handleSubmit = async (e) => {
    setLoading(true);
    try {
      const res = await apiFetch("/auth/signup", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          username,
          email,
          password,
        }),
      });
      if (!res.ok) {
        throw new Error("Signup failed");
      }
      const data = await res.json();

      setUsername("");
      setEmail("");
      setPassword("");
      setSuccess(data.message);
      setLoading(false);

      router.push('/auth/signin');

    } catch (error) {
      console.log("Error:", error.message);
      setError("Something went wrong!!");
      setLoading(false);
    }
  };
  return (
    <div className="flex flex-col mx-auto text-center w-1/3 m-2 border border-amber-200">
      <label>username</label>
      <input
        type="text"
        onChange={(e) => setUsername(e.target.value)}
        value={username}
        className="border w-1/2 mx-auto p-2 m-2"
      />
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
      <h3>Already had a account? <Link href='/auth/signin'>Signin</Link></h3>
      {success && <p className="text-green-500">{success}</p>}
      {error && <p className="text-red-500">{error}</p>}
    </div>
  );
};

export default Signup;
