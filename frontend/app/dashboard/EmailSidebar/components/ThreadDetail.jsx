import React from "react";

const formatDateTime = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
};

const ThreadDetail = ({
  thread,
  messages,
  loading,
  error,
  onMarkRead,
  onMarkUnread,
  onRetry,
}) => {
  if (!thread) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        <p className="text-base font-semibold text-gray-700">
          Select a conversation
        </p>
        <p className="mt-2 max-w-sm text-xs text-gray-500">
          Choose a message from the left to see the full thread, reply history,
          and message details.
        </p>
      </div>
    );
  }

  const latestMessage = messages?.[messages.length - 1];
  const title = thread.subject || latestMessage?.subject || "Conversation";
  const subtitle =
    latestMessage?.from ||
    thread.from ||
    "Sender details will appear here.";

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  thread.isUnread ? "bg-blue-500" : "bg-emerald-500"
                }`}
              />
              <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            </div>
            <p className="mt-1 text-xs text-gray-500">{subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
              {thread.account || "Account"}
            </span>
            <button
              type="button"
              onClick={thread.isUnread ? onMarkRead : onMarkUnread}
              className="rounded-full border border-gray-200 px-3 py-1 text-[11px] font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              {thread.isUnread ? "Mark as read" : "Mark as unread"}
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-500">
          <span>
            Last updated:{" "}
            {formatDateTime(latestMessage?.receivedAt || latestMessage?.date) ||
              "—"}
          </span>
          <span>Messages: {messages?.length || 0}</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        {loading ? (
          <div className="text-sm text-gray-500">Loading conversation...</div>
        ) : error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
            {error}
            <button
              type="button"
              onClick={onRetry}
              className="ml-3 rounded-full border border-rose-200 px-3 py-1 text-[11px] font-semibold text-rose-700"
            >
              Retry
            </button>
          </div>
        ) : messages?.length ? (
          <div className="flex flex-col gap-3">
            {messages.map((message, index) => {
              const isLatest = index === messages.length - 1;
              const body =
                message.bodyText ||
                message.snippet ||
                "No message content available.";

              return (
                <details
                  key={message.id || `${message.threadId}-${index}`}
                  open={isLatest}
                  className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3"
                >
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {message.from || "Unknown sender"}
                        </p>
                        <p className="text-[11px] text-gray-500">
                          To: {message.to || "Unknown recipient"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-gray-500">
                        {message.isUnread ? (
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 font-semibold text-blue-700">
                            Unread
                          </span>
                        ) : null}
                        <span>
                          {formatDateTime(
                            message.receivedAt || message.date
                          ) || "—"}
                        </span>
                      </div>
                    </div>
                  </summary>
                  <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                    {body}
                  </div>
                </details>
              );
            })}
          </div>
        ) : (
          <div className="text-sm text-gray-500">
            No messages available for this thread.
          </div>
        )}
      </div>
    </div>
  );
};

export default ThreadDetail;
