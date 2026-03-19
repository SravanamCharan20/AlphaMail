import React from "react";
import { getThreadKey } from "../emailUtils";

const escapeRegex = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const EmailCards = ({
  msgs,
  selectedKey,
  onSelect,
  now,
  highlightQuery = "",
}) => {
  const nowTs =
    typeof now === "number"
      ? now
      : now
      ? new Date(now).getTime()
      : 0;
  const normalizedQuery = highlightQuery.trim();
  const isSearchMode = normalizedQuery.length > 0;

  const renderHighlightedText = (text) => {
    if (!normalizedQuery || normalizedQuery.length < 2) {
      return text;
    }
    const safeQuery = escapeRegex(normalizedQuery);
    const regex = new RegExp(`(${safeQuery})`, "ig");
    const parts = String(text || "").split(regex);
    return parts.map((part, idx) =>
      regex.test(part) ? (
        <mark
          key={`${part}-${idx}`}
          className="rounded bg-[var(--accent-soft)] px-1 text-[color:var(--accent)]"
        >
          {part}
        </mark>
      ) : (
        <span key={`${part}-${idx}`}>{part}</span>
      )
    );
  };
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

  const tagLabels = {
    needs_reply: "Needs reply",
    deadline: "Deadline",
    follow_up: "Follow up",
    spam: "Spam",
  };

  const tagStyles = {
    needs_reply: "bg-blue-100 text-blue-700 border-blue-100",
    deadline: "bg-amber-100 text-amber-700 border-amber-100",
    follow_up: "bg-purple-100 text-purple-700 border-purple-100",
    spam: "bg-gray-100 text-gray-600 border-gray-200",
  };

  return (
    <div className="overflow-hidden cursor-pointer rounded-2xl border border-black/10 bg-white/70 shadow-[0_20px_60px_rgba(0,0,0,0.08)] backdrop-blur detail-noise">
      {msgs.map((mail, index) => {
        const isSelected =
          selectedKey && selectedKey === getThreadKey(mail);
        const matchPercent =
          typeof mail.searchScore === "number"
            ? Math.round(
                Math.min(Math.max(mail.searchScore, 0), 1) * 100
              )
            : null;
        const rawTags = Array.isArray(mail.tags) ? mail.tags : [];
        const displayTags = rawTags.filter((tag) => tagLabels[tag]);
        const tagsToShow = displayTags.slice(0, 2);
        const extraCount = displayTags.length - tagsToShow.length;
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
            className={`group relative cursor-pointer w-full text-left px-3.5 py-3 interactive ${
              isSelected ? "bg-black/5" : "hover:bg-black/5"
            } ${
              isSearchMode ? "bg-white/80" : ""
            } border-b border-black/10 last:border-b-0`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 h-9 w-9 flex-shrink-0 rounded-full text-xs font-semibold uppercase grid place-items-center ${
                  mail.isUnread
                    ? "bg-white/90 text-[color:var(--ink)] border border-black/10"
                    : "bg-white/60 text-gray-600 border border-black/10"
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
                    {renderHighlightedText(mail.subject || "No subject")}
                  </p>
                  <span className="flex items-center gap-1 whitespace-nowrap text-[11px] text-gray-500">
                    {mail.isUnread ? (
                      <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                    ) : null}
                    {formatDate(mail.receivedAt || mail.date) || "—"}
                  </span>
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px]">
                  {mail.newUntil && nowTs > 0 && nowTs < mail.newUntil ? (
                    <span className="rounded-full border border-black/10 bg-white/80 px-2 py-0.5 font-semibold text-[color:var(--ink)]">
                      New
                    </span>
                  ) : null}
                  {isSearchMode && matchPercent !== null ? (
                    <span className="rounded-full border border-black/10 bg-green-200/80 px-2 py-0.5 font-semibold text-[color:var(--ink)]">
                      Match {matchPercent}%
                    </span>
                  ) : null}
                  {isSearchMode && mail.account ? (
                    <span className="rounded-full border border-black/10 bg-white/70 px-2 py-0.5 font-semibold text-[10px] text-gray-600">
                      {mail.account}
                    </span>
                  ) : null}
                  {tagsToShow.map((tag) => (
                    <span
                      key={`${mail._id}-${tag}`}
                      className={`rounded-full border px-2 py-0.5 font-semibold ${tagStyles[tag]}`}
                    >
                      {tagLabels[tag]}
                    </span>
                  ))}
                  {extraCount > 0 ? (
                    <span className="rounded-full border border-black/10 bg-white/70 px-2 py-0.5 font-semibold text-gray-600">
                      +{extraCount}
                    </span>
                  ) : null}
                </div>

                <p
                  className={`mt-2 leading-relaxed text-xs line-clamp-2 ${
                    mail.isUnread ? "text-gray-700" : "text-gray-500"
                  }`}
                >
                  {renderHighlightedText(
                    mail.searchSnippet ||
                      mail.snippet ||
                      "No preview available."
                  )}
                </p>

                <div className="mt-2 flex flex-wrap items-center gap-1 text-[10px]">
                  {isSearchMode ? (
                    <>
                      <span className="inline-flex items-center rounded-full border border-black/10 bg-white/70 px-2 py-0.5 font-semibold text-gray-700">
                        From: {renderHighlightedText(getFromName(mail.from))}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-black/10 bg-white/70 px-2 py-0.5 font-semibold text-gray-700">
                        To: {getToLabel(mail.to) || "Recipient"}
                      </span>
                    </>
                  ) : (
                    <span className="inline-flex items-center rounded-full border border-black/10 bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-gray-700">
                      To: {getToLabel(mail.to) || mail.account || "Recipient"}
                    </span>
                  )}
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
