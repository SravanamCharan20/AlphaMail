import React from "react";
import { getThreadKey } from "../emailUtils";

const EmailCards = ({ msgs, selectedKey, onSelect, now }) => {
  const nowTs =
    typeof now === "number"
      ? now
      : now
      ? new Date(now).getTime()
      : Date.now();
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

  const getFromName = (value) => {
    if (!value) return "Unknown sender";
    const match = value.match(/^(.*?)(<|$)/);
    const name = match?.[1]?.trim();
    return name || value;
  };

  const getInitials = (value) => {
    const name = getFromName(value);
    const parts = name.split(" ").filter(Boolean).slice(0, 2);
    const initials = parts.map((part) => part[0]).join("");
    return initials ? initials.toUpperCase() : "U";
  };

  const getToLabel = (value) => {
    if (!value) return "";
    return value.split(",")[0].trim();
  };

  const getProviderTag = (account) => {
    if (!account) return "Account";
    if (account.includes("gmail.com")) return "Gmail";
    return account.split("@")[1] ? account.split("@")[1] : account;
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-black/5 bg-white/92 shadow-[0_10px_22px_rgba(15,23,42,0.05)]">
      {msgs.map((mail, index) => {
        const isSelected =
          selectedKey && selectedKey === getThreadKey(mail);
        return (
          <button
            key={mail._id || mail.threadId || index}
            type="button"
            onClick={() => onSelect?.(mail)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect?.(mail);
              }
            }}
            className={`group relative w-full text-left px-3.5 py-3 transition ${
              isSelected
                ? "bg-[var(--accent-soft)]/60"
                : "hover:bg-black/5"
            } border-b border-black/5 last:border-b-0`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 h-9 w-9 flex-shrink-0 rounded-full text-xs font-semibold uppercase grid place-items-center ${
                  mail.isUnread
                    ? "bg-[var(--accent-soft)] text-[color:var(--accent)]"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {getInitials(mail.from)}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p
                    className={`text-[14px] line-clamp-2 ${
                      mail.isUnread
                        ? "font-semibold text-gray-900"
                        : "font-medium text-gray-700"
                    }`}
                  >
                    {mail.subject || "No subject"}
                  </p>
                  <span className="flex items-center gap-1 whitespace-nowrap text-[11px] text-gray-500">
                    {mail.isUnread ? (
                      <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                    ) : null}
                    {formatDate(mail.receivedAt || mail.date) || "—"}
                  </span>
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px]">
                  {mail.newUntil && nowTs < mail.newUntil ? (
                    <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
                      New
                    </span>
                  ) : null}
                </div>

                <p
                  className={`mt-2 leading-relaxed text-xs line-clamp-2 ${
                    mail.isUnread ? "text-gray-700" : "text-gray-500"
                  }`}
                >
                  {mail.snippet || "No preview available."}
                </p>

                <div className="mt-2">
                  <span className="inline-flex items-center rounded-full border border-black/5 bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                    To: {getToLabel(mail.to) || mail.account || "Recipient"}
                  </span>
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default EmailCards;
