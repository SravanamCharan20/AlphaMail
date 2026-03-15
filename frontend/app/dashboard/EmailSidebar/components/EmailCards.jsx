import React from "react";

const EmailCards = ({ msgs }) => {
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
          className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md hover:border-gray-300 animate-fadeInUp"
          style={{
            animationDelay: `${index * 70}ms`,
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-gray-900 line-clamp-2">
              {mail.subject || "No subject"}
            </p>
            <span className="text-[11px] text-gray-500 whitespace-nowrap">
              {formatDate(mail.receivedAt || mail.date) || "—"}
            </span>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <p className="text-xs text-gray-600 truncate">
              {getFromLabel(mail.from)}
            </p>
            <span className="max-w-[140px] truncate rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
              {getAccountLabel(mail.account)}
            </span>
          </div>

          <p className="mt-2 text-xs text-gray-500 leading-relaxed line-clamp-2">
            {mail.snippet || "No preview available."}
          </p>
        </div>
      ))}
    </div>
  );
};

export default EmailCards;
