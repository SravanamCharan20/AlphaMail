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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#fff7ef_0%,_#f6f2ee_45%,_#efe7df_100%)] flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-[0_20px_60px_rgba(0,0,0,0.12)] border border-neutral-200 p-6 text-center animate-[fadeUp_0.35s_ease-out]">
        <div className="mx-auto h-12 w-12 rounded-full bg-green-100 text-green-700 grid place-items-center">
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
