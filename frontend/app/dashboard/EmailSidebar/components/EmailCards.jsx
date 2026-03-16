import React from "react";
import { getThreadKey } from "../emailUtils";

const EmailCards = ({ msgs, selectedKey, onSelect, density = "comfortable" }) => {
  const compact = density === "compact";
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
            className={`group relative w-full text-left ${
              compact ? "px-3 py-2.5" : "px-3.5 py-3"
            } transition ${
              isSelected
                ? "bg-[var(--accent-soft)]/60"
                : "hover:bg-black/5"
            } ${
              mail.isUnread
                ? "before:absolute before:left-0 before:top-3 before:bottom-3 before:w-[3px] before:rounded-full before:bg-[var(--accent)]"
                : ""
            } border-b border-black/5 last:border-b-0`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-start gap-2">
                  <span
                    className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${
                      mail.isUnread ? "bg-[var(--accent)]" : "bg-gray-200"
                    }`}
                  />
                  <p
                    className={`${
                      compact ? "text-[13px]" : "text-[14px]"
                    } line-clamp-2 ${
                      mail.isUnread
                        ? "font-semibold text-gray-900"
                        : "font-medium text-gray-700"
                    }`}
                  >
                    {mail.subject || "No subject"}
                  </p>
                </div>
                <div
                  className={`mt-2 flex items-center gap-2 ${
                    compact ? "text-[11px]" : "text-xs"
                  }`}
                >
                  <p className="text-gray-600 truncate">
                    {getFromLabel(mail.from)}
                  </p>
                  <span className="max-w-[140px] truncate rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--accent)]">
                    {getAccountLabel(mail.account)}
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 text-[11px] text-gray-500">
                <span className="whitespace-nowrap">
                  {formatDate(mail.receivedAt || mail.date) || "—"}
                </span>
                <div className="flex items-center gap-1">
                  {mail.syncSource === "incremental" ||
                  mail.isIncremental ? (
                    <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      New
                    </span>
                  ) : null}
                  {mail.isUnread ? (
                    <span className="rounded-full border border-[color:var(--accent-soft)] bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--accent)]">
                      Unread
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <p
              className={`mt-2 leading-relaxed ${
                compact ? "text-[11px] line-clamp-1" : "text-xs line-clamp-2"
              } ${
                mail.isUnread ? "text-gray-700" : "text-gray-500"
              }`}
            >
              {mail.snippet || "No preview available."}
            </p>
          </button>
        );
      })}
    </div>
  );
};

export default EmailCards;
