import React from "react";
import { getThreadKey } from "../emailUtils";

const EmailCards = ({ msgs, selectedKey, onSelect }) => {
  const formatDate = (value) => {
    if (!value) return "";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "";

    const now = new Date();
    const sameYear = parsed.getFullYear() === now.getFullYear();

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "2-digit",
      year: sameYear ? undefined : "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(parsed);
  };

  const getFromLabel = (from) => {
    if (!from) return "Unknown sender";
    return from;
  };

  const getAccountLabel = (account) => {
    if (!account) return "Unknown account";
    return account;
  };

  return (
    <div className="flex flex-col gap-3">
      {msgs.map((mail, index) => (
        <div
          key={mail._id || mail.threadId || index}
          role="button"
          tabIndex={0}
          onClick={() => onSelect?.(mail)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelect?.(mail);
            }
          }}
          className={`rounded-xl border bg-white p-4 shadow-sm transition hover:shadow-md animate-fadeInUp ${
            selectedKey && selectedKey === getThreadKey(mail)
              ? "border-blue-300 ring-2 ring-blue-100"
              : "border-gray-200 hover:border-gray-300"
          }`}
          style={{
            animationDelay: `${index * 70}ms`,
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <span
                className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${
                  mail.isUnread ? "bg-blue-500" : "bg-gray-200"
                }`}
              />
              <p
                className={`text-sm line-clamp-2 ${
                  mail.isUnread
                    ? "font-semibold text-gray-900"
                    : "font-medium text-gray-700"
                }`}
              >
              {mail.subject || "No subject"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {mail.syncSource === "incremental" || mail.isIncremental ? (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                  New
                </span>
              ) : null}
              {mail.isUnread ? (
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                  Unread
                </span>
              ) : null}
              <span className="text-[11px] text-gray-500 whitespace-nowrap">
                {formatDate(mail.receivedAt || mail.date) || "—"}
              </span>
            </div>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <p className="text-xs text-gray-600 truncate">
              {getFromLabel(mail.from)}
            </p>
            <span className="max-w-[140px] truncate rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
              {getAccountLabel(mail.account)}
            </span>
          </div>

          <p
            className={`mt-2 text-xs leading-relaxed line-clamp-2 ${
              mail.isUnread ? "text-gray-700" : "text-gray-500"
            }`}
          >
            {mail.snippet || "No preview available."}
          </p>
        </div>
      ))}
    </div>
  );
};

export default EmailCards;
