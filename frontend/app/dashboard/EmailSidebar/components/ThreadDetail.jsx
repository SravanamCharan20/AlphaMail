import React, { useEffect, useMemo, useState } from "react";

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

const normalizeText = (value) =>
  String(value || "")
    .replace(/\u200b|\u200c|\u200d|\ufeff/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const normalizeHtml = (value) =>
  String(value || "")
    .replace(/&zwnj;|&#8204;|&#8205;/gi, "")
    .replace(/&nbsp;/gi, " ");

const extractLinks = (text) => {
  if (!text) return [];
  const matches = text.match(
    /https?:\/\/[^\s)>"']+|www\.[^\s)>"']+/gi
  );
  if (!matches) return [];
  return matches
    .map((link) =>
      link.startsWith("http") ? link : `https://${link}`
    )
    .filter(Boolean);
};

const parseEmailAddresses = (value) => {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
};

const extractEmailAddress = (value) => {
  if (!value) return "";
  const match = value.match(/<([^>]+)>/);
  if (match?.[1]) return match[1].trim().toLowerCase();
  const fallback = value.match(
    /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/
  );
  return fallback?.[1] ? fallback[1].trim().toLowerCase() : "";
};

const RAW_BASE_CSS = `
  :root { color-scheme: light; }
  html, body {
    margin: 0;
    padding: 0;
    background: #ffffff;
    color: #202124;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 14px;
    line-height: 1.6;
  }
  body { padding: 16px 18px 24px; }
  img, svg { max-width: 100%; height: auto; }
  table { border-collapse: collapse; }
  a { color: #1a73e8; text-decoration: underline; }
  blockquote { margin: 12px 0; padding-left: 12px; border-left: 3px solid #e0e0e0; color: #5f6368; }
`;

const injectRawCss = (html, cssText) => {
  if (!html) return "";
  if (!cssText) return html;
  const styleTag = `<style>${cssText}</style>`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (match) => `${match}${styleTag}`);
  }
  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/<body[^>]*>/i, (match) => `${styleTag}${match}`);
  }
  return `${styleTag}${html}`;
};

const formatBytes = (value) => {
  const size = Number(value) || 0;
  if (size < 1024) return `${size} B`;
  const kb = size / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
};

const splitQuotedText = (text) => {
  const patterns = [
    /^On .+ wrote:$/m,
    /^From: .+$/m,
    /^-----Original Message-----$/m,
    /^>+/m,
  ];
  const matchIndex = patterns
    .map((pattern) => {
      const match = text.match(pattern);
      return match ? match.index : -1;
    })
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];

  if (matchIndex === undefined) {
    return { main: text, quoted: "" };
  }

  return {
    main: text.slice(0, matchIndex).trim(),
    quoted: text.slice(matchIndex).trim(),
  };
};

const extractHtmlSegments = (html) => {
  if (!html) return { mainHtml: "", quotedHtml: "" };
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return { mainHtml: html, quotedHtml: "" };
  }
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const quote =
      doc.querySelector(".gmail_quote") ||
      doc.querySelector(".yahoo_quoted") ||
      doc.querySelector("blockquote") ||
      doc.querySelector("#appendonsend");

    let quotedHtml = "";
    if (quote) {
      quotedHtml = quote.outerHTML;
      quote.remove();
    }

    const signature = doc.querySelector(".gmail_signature");
    if (signature) {
      signature.remove();
    }

    return {
      mainHtml: doc.body.innerHTML.trim(),
      quotedHtml: quotedHtml.trim(),
    };
  } catch (error) {
    return { mainHtml: html, quotedHtml: "" };
  }
};

const ThreadDetail = ({
  thread,
  messages,
  loading,
  error,
  onRetry,
  trustedSenders = [],
  onTrustSender,
  onUntrustSender,
  readingMode = "clean",
  showDetails = false,
}) => {
  const [showImages, setShowImages] = useState(true);
  const [expandedQuotes, setExpandedQuotes] = useState({});
  const [frameHeights, setFrameHeights] = useState({});

  const trustedSet = useMemo(() => {
    return new Set(
      (trustedSenders || [])
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean)
    );
  }, [trustedSenders]);

  useEffect(() => {
    setExpandedQuotes({});
    setFrameHeights({});
  }, [thread?.threadId, thread?.account]);

  useEffect(() => {
    const email = extractEmailAddress(thread?.from || "");
    const domain = email.split("@")[1] || "";
    const trusted =
      (email && trustedSet.has(email)) ||
      (domain && trustedSet.has(domain));
    setShowImages(Boolean(trusted));
  }, [thread?.threadId, thread?.account, trustedSet]);

  const threadMeta = useMemo(() => {
    const allAttachments = [];
    const allLinks = [];
    const participants = new Set();

    (messages || []).forEach((msg) => {
      parseEmailAddresses(msg.from).forEach((addr) =>
        participants.add(addr)
      );
      parseEmailAddresses(msg.to).forEach((addr) =>
        participants.add(addr)
      );
      const textForLinks =
        msg.bodyText || msg.snippet || msg.subject || "";
      allLinks.push(...extractLinks(textForLinks));
      if (Array.isArray(msg.attachments)) {
        msg.attachments.forEach((attachment) => {
          allAttachments.push({
            ...attachment,
            messageId: msg.id,
            from: msg.from,
            receivedAt: msg.receivedAt || msg.date,
          });
        });
      }
    });

    const uniqueLinks = Array.from(new Set(allLinks));
    const uniqueAttachments = allAttachments.filter((attachment, index) => {
      const key = attachment.attachmentId || attachment.url || attachment.filename;
      return (
        allAttachments.findIndex((att) => {
          const compareKey =
            att.attachmentId || att.url || att.filename;
          return compareKey === key;
        }) === index
      );
    });

    return {
      participants: Array.from(participants),
      attachments: uniqueAttachments,
      links: uniqueLinks,
      unreadCount: (messages || []).filter((msg) => msg.isUnread).length,
      total: messages?.length || 0,
    };
  }, [messages]);

  const handleFrameLoad = (messageId, event) => {
    const iframe = event.currentTarget;
    try {
      const height =
        iframe?.contentWindow?.document?.body?.scrollHeight || 0;
      if (!height) return;
      setFrameHeights((prev) => ({
        ...prev,
        [messageId]: height + 12,
      }));
    } catch (error) {
      // Ignore cross-origin issues.
    }
  };

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
  const hasImages = messages?.some((msg) => msg.hasImages);
  const imagesVisible = readingMode === "raw" && showImages;
  const senderEmail = extractEmailAddress(
    latestMessage?.from || thread.from || ""
  );
  const senderDomain = senderEmail.split("@")[1] || "";
  const trustedKey = senderDomain || senderEmail;
  const isTrustedSender = trustedKey
    ? trustedSet.has(trustedKey) || trustedSet.has(senderEmail)
    : false;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="relative rounded-[24px] border border-black/5 bg-white/92 px-4 py-3 shadow-[0_12px_26px_rgba(15,23,42,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  thread.isUnread
                    ? "bg-[var(--accent)]"
                    : "bg-slate-300"
                }`}
              />
              <h2 className="font-display text-[1.05rem] font-semibold tracking-tight text-gray-900 truncate">
                {title}
              </h2>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
              <span className="truncate">{subtitle}</span>
              <span className="text-gray-300">•</span>
              <span>
                {formatDateTime(
                  latestMessage?.receivedAt || latestMessage?.date
                ) || "—"}
              </span>
              <span className="text-gray-300">•</span>
              <span>{messages?.length || 0} messages</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-[11px] font-semibold text-[color:var(--accent)]">
              {thread.account || "Account"}
            </span>
            {isTrustedSender ? (
              <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                Images trusted
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div
        className={`grid min-h-0 flex-1 gap-4 ${
          showDetails
            ? "lg:grid-cols-[minmax(0,1fr)_220px] xl:grid-cols-[minmax(0,1fr)_240px]"
            : "grid-cols-1"
        }`}
      >
        <div className="min-h-0 overflow-y-auto rounded-[26px] border border-black/5 bg-white p-5 shadow-[0_14px_28px_rgba(15,23,42,0.05)]">
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
                const htmlToUse = normalizeHtml(
                  message.bodyHtmlNoImages || message.bodyHtml || ""
                );
                const textBody = normalizeText(
                  message.bodyText || message.snippet || ""
                );
                const { mainHtml, quotedHtml } =
                  readingMode === "clean"
                    ? extractHtmlSegments(htmlToUse)
                    : { mainHtml: htmlToUse, quotedHtml: "" };
                const { main, quoted } = splitQuotedText(textBody);
                const hasQuoted = Boolean(quotedHtml || quoted);
                const attachments = Array.isArray(message.attachments)
                  ? message.attachments
                  : [];
                const isExpanded = expandedQuotes[message.id] || false;
                const frameKey =
                  message.id || `${message.threadId || "thread"}-${index}`;
                const rawHtml =
                  message.bodyHtmlRaw || message.bodyHtml || "";
                const rawCss = `${RAW_BASE_CSS}${
                  !imagesVisible
                    ? "\nimg,svg,video{display:none !important;}*{background-image:none !important;background:none !important;}"
                    : ""
                }`;
                const rawHtmlWithCss = injectRawCss(rawHtml, rawCss);

                const contentClass =
                  "email-content email-content--clean";

                return (
                  <details
                    key={message.id || `${message.threadId}-${index}`}
                    open={isLatest}
                    className="rounded-2xl border border-black/5 bg-white px-4 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.04)]"
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
                          <span className="rounded-full border border-[color:var(--accent-soft)] bg-[var(--accent-soft)] px-2 py-0.5 font-semibold text-[color:var(--accent)]">
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
                    {message.hasImages && !imagesVisible ? (
                      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                        <p>
                          {readingMode === "clean"
                            ? "Images are hidden in Clean view."
                            : "Images are hidden to protect your privacy."}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {readingMode !== "clean" ? (
                            <button
                              type="button"
                              onClick={() => setShowImages(true)}
                              className="rounded-full border border-amber-200 bg-white px-3 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-50"
                            >
                              Show images
                            </button>
                          ) : null}
                          {!isTrustedSender && senderDomain ? (
                            <button
                              type="button"
                              onClick={() => {
                                onTrustSender?.(senderDomain);
                                setShowImages(true);
                              }}
                              className="rounded-full border border-amber-200 bg-white px-3 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-50"
                            >
                              Always show images from {senderDomain}
                            </button>
                          ) : null}
                          {isTrustedSender && senderDomain ? (
                            <button
                              type="button"
                              onClick={() => onUntrustSender?.(senderDomain)}
                              className="rounded-full border border-amber-200 bg-white px-3 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-50"
                            >
                              Stop trusting {senderDomain}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    {readingMode === "raw" ? (
                      rawHtmlWithCss ? (
                        <iframe
                          title={`raw-html-${frameKey}`}
                          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                          className="mt-3 w-full rounded-lg border border-black/5 bg-white"
                          style={{
                            height:
                              frameHeights[frameKey] ||
                              360,
                          }}
                          srcDoc={rawHtmlWithCss}
                          onLoad={(event) =>
                            handleFrameLoad(frameKey, event)
                          }
                        />
                      ) : (
                        <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                          {main || "No message content available."}
                        </div>
                      )
                    ) : mainHtml ? (
                      <div
                        className={`${contentClass} mt-3 overflow-x-auto`}
                        dangerouslySetInnerHTML={{
                          __html: mainHtml,
                        }}
                      />
                    ) : (
                      <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                        {main || "No message content available."}
                      </div>
                    )}

                    {readingMode === "clean" && hasQuoted ? (
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedQuotes((prev) => ({
                              ...prev,
                              [message.id]: !isExpanded,
                            }))
                          }
                          className="rounded-full border border-gray-200 px-3 py-1 text-[11px] font-semibold text-gray-600 transition hover:bg-gray-100"
                        >
                          {isExpanded
                            ? "Hide quoted text"
                            : "Show quoted text"}
                        </button>
                        {isExpanded ? (
                          quotedHtml ? (
                            <div
                              className="email-content email-content--clean mt-3 rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-600"
                              dangerouslySetInnerHTML={{
                                __html: quotedHtml,
                              }}
                            />
                          ) : (
                            <div className="mt-3 whitespace-pre-wrap rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-600">
                              {quoted}
                            </div>
                          )
                        ) : null}
                      </div>
                    ) : null}

                    {attachments.length ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {attachments.map((attachment, attIndex) => {
                          const href = attachment.url || attachment.dataUrl;
                          if (!href) return null;
                          return (
                          <a
                            key={`${
                              attachment.attachmentId || "inline"
                            }-${attIndex}`}
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-full border border-black/5 bg-white px-3 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50"
                          >
                              {attachment.inline ? "Inline" : "File"}
                              <span className="max-w-[140px] truncate">
                                {attachment.filename}
                              </span>
                              <span className="text-[10px] text-gray-400">
                                {formatBytes(attachment.size)}
                              </span>
                            </a>
                          );
                        })}
                      </div>
                    ) : null}
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

        {showDetails ? (
          <aside className="min-h-0 overflow-y-auto rounded-[28px] border border-black/5 bg-white p-4 shadow-[0_16px_32px_rgba(15,23,42,0.05)]">
            <div className="space-y-4 text-xs text-gray-600">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  Thread stats
                </p>
                <div className="mt-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <span>Total messages</span>
                    <span className="font-semibold text-gray-800">
                      {threadMeta.total}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Unread</span>
                    <span className="font-semibold text-gray-800">
                      {threadMeta.unreadCount}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Attachments</span>
                    <span className="font-semibold text-gray-800">
                      {threadMeta.attachments.length}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  Participants
                </p>
                <div className="mt-2 flex flex-col gap-1">
                  {threadMeta.participants.length ? (
                    threadMeta.participants.map((participant) => (
                      <span key={participant} className="truncate">
                        {participant}
                      </span>
                    ))
                  ) : (
                    <span className="text-gray-400">No participants</span>
                  )}
                </div>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  Image trust
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      isTrustedSender
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {isTrustedSender ? "Trusted" : "Not trusted"}
                  </span>
                  {senderDomain ? (
                    <button
                      type="button"
                      onClick={() =>
                        isTrustedSender
                          ? onUntrustSender?.(senderDomain)
                          : onTrustSender?.(senderDomain)
                      }
                      className="rounded-full border border-black/5 bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-600 hover:bg-gray-50"
                    >
                      {isTrustedSender ? "Revoke" : "Trust sender"}
                    </button>
                  ) : null}
                </div>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  Attachments
                </p>
                <div className="mt-2 flex flex-col gap-2">
                  {threadMeta.attachments.length ? (
                    threadMeta.attachments.map((attachment, index) => {
                      const href = attachment.url || attachment.dataUrl;
                      if (!href) return null;
                      return (
                        <a
                          key={`${attachment.attachmentId || "att"}-${index}`}
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-100"
                        >
                          <span className="truncate">
                            {attachment.filename}
                          </span>
                          <span className="text-gray-400">
                            {formatBytes(attachment.size)}
                          </span>
                        </a>
                      );
                    })
                  ) : (
                    <span className="text-gray-400">No attachments</span>
                  )}
                </div>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  Links
                </p>
                <div className="mt-2 flex flex-col gap-1">
                  {threadMeta.links.length ? (
                    threadMeta.links.slice(0, 8).map((link) => (
                      <a
                        key={link}
                        href={link}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate text-[11px] text-[color:var(--accent)] hover:underline"
                      >
                        {link}
                      </a>
                    ))
                  ) : (
                    <span className="text-gray-400">No links</span>
                  )}
                </div>
              </div>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
};

export default ThreadDetail;
