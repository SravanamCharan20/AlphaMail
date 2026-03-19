const normalize = (value) => String(value || "").toLowerCase();

const getHeader = (headers, name) => {
  if (!Array.isArray(headers)) return "";
  const target = name.toLowerCase();
  const header = headers.find(
    (item) => String(item?.name || "").toLowerCase() === target
  );
  return String(header?.value || "");
};

const hasAny = (text, patterns) =>
  patterns.some((pattern) => pattern.test(text));

const keywordMatch = (text, phrases) =>
  phrases.some((phrase) => text.includes(phrase));

const parseDateFromText = (text, baseDate) => {
  const now = baseDate instanceof Date ? baseDate : new Date();
  const lower = normalize(text);

  if (/\b(tomorrow)\b/.test(lower)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  if (/\b(today|tonight|eod|end of day)\b/.test(lower)) {
    const d = new Date(now);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  const monthMatch = lower.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}(?:,\s*\d{4})?\b/
  );
  if (monthMatch) {
    const parsed = new Date(monthMatch[0]);
    if (!Number.isNaN(parsed.getTime())) {
      if (!/\d{4}/.test(monthMatch[0])) {
        parsed.setFullYear(now.getFullYear());
      }
      parsed.setHours(23, 59, 59, 999);
      return parsed;
    }
  }

  const numericMatch = lower.match(
    /\b(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)\b/
  );
  if (numericMatch) {
    const parsed = new Date(numericMatch[1]);
    if (!Number.isNaN(parsed.getTime())) {
      parsed.setHours(23, 59, 59, 999);
      return parsed;
    }
  }

  return null;
};

export const classifyEmail = ({
  subject,
  from,
  to,
  snippet,
  headers = [],
  labelIds = [],
  receivedAt,
}) => {
  const text = normalize([subject, snippet].filter(Boolean).join(" "));
  const fromLower = normalize(from);
  const toLower = normalize(to);

  const listUnsubscribe = getHeader(headers, "List-Unsubscribe");
  const precedence =
    normalize(getHeader(headers, "Precedence")) ||
    normalize(getHeader(headers, "X-Precedence"));

  const isNoReply = /no[-_. ]?reply|do[-_. ]?not[-_. ]?reply|noreply|donotreply/.test(
    fromLower
  );

  let spamCategory = null;
  if (labelIds.includes("SPAM") || labelIds.includes("TRASH"))
    spamCategory = "spam";
  else if (labelIds.includes("CATEGORY_PROMOTIONS"))
    spamCategory = "promotions";
  else if (labelIds.includes("CATEGORY_SOCIAL")) spamCategory = "social";
  else if (labelIds.includes("CATEGORY_FORUMS")) spamCategory = "forums";
  else if (labelIds.includes("CATEGORY_UPDATES")) spamCategory = "updates";
  else if (listUnsubscribe) spamCategory = "newsletter";
  else if (precedence.includes("bulk") || precedence.includes("list"))
    spamCategory = "bulk";
  else if (keywordMatch(text, ["unsubscribe", "newsletter", "digest"]))
    spamCategory = "newsletter";
  else if (keywordMatch(text, ["subscription", "subscribed"]))
    spamCategory = "subscription";

  const tags = new Set();
  if (spamCategory) tags.add("spam");

  const replySignals = [
    /[?]/,
    /\b(reply|respond|response)\b/,
    /\b(let me know|please|could you|can you|would you)\b/,
    /\b(need your|awaiting)\b/,
  ];

  if (!spamCategory && !isNoReply) {
    if (hasAny(text, replySignals) || hasAny(toLower, replySignals)) {
      tags.add("needs_reply");
    }
  }

  const followUpSignals = [
    /\b(follow up|following up)\b/,
    /\b(reminder|just checking)\b/,
  ];
  if (hasAny(text, followUpSignals)) {
    tags.add("follow_up");
  }

  const deadlineSignals = [
    /\b(deadline|due by|due|submit by|before|expires|expiring|last date|by (today|tomorrow|eod|end of day))\b/,
    /\b(today|tomorrow|tonight|eod|end of day)\b/,
  ];
  let deadlineAt = null;
  if (hasAny(text, deadlineSignals)) {
    tags.add("deadline");
    deadlineAt = parseDateFromText(text, receivedAt);
  }

  return {
    tags: Array.from(tags),
    spamCategory,
    deadlineAt,
  };
};
