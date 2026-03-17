"use client";

import React, { useEffect } from "react";
import { FiCheck } from "react-icons/fi";
import { useSearchParams } from "next/navigation";

const OAuthSuccess = () => {
  const searchParams = useSearchParams();
  const email = searchParams.get("email");
  const provider = searchParams.get("provider") || "Gmail";

  useEffect(() => {
    if (window.opener) {
      window.opener.postMessage(
        { type: "oauth-success", provider, email },
        window.location.origin
      );
    }
    const closeTimer = setTimeout(() => {
      window.close();
    }, 800);
    return () => clearTimeout(closeTimer);
  }, [provider, email]);

  return (
    <div className="min-h-screen bg-[var(--canvas)] flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-3xl bg-white/80 shadow-[0_20px_60px_rgba(0,0,0,0.12)] border border-black/10 p-6 text-center backdrop-blur animate-[fadeUp_0.35s_ease-out]">
        <div className="mx-auto h-12 w-12 rounded-full bg-black text-white grid place-items-center">
          <FiCheck className="text-[24px]" />
        </div>
        <h1 className="mt-4 text-base font-semibold text-neutral-900">
          Connection complete
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          You can close this window if it doesn’t close automatically.
        </p>
      </div>
    </div>
  );
};

export default OAuthSuccess;
