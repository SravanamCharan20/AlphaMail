const normalize = (value) => String(value || "").toLowerCase();

const hasAny = (text, patterns) => patterns.some((pattern) => pattern.test(text));

const includesAny = (text, phrases) =>
  phrases.some((phrase) => text.includes(phrase));

const REPLY_PATTERNS = [
  /\b(reply|respond|response)\b/,
  /\b(let me know|please|could you|can you|would you)\b/,
  /\b(need your|awaiting|waiting for|looking for)\b/,
  /\b(approve|approval|sign off|signoff|review|feedback)\b/,
  /\b(rsvp|confirm|confirmation)\b/,
  /\b(action required|action needed)\b/,
  /\b(availability|meeting|schedule)\b/,
  /[?]/,
];

const FOLLOW_UP_PATTERNS = [
  /\b(follow up|following up)\b/,
  /\b(reminder|just checking|checking in|gentle reminder)\b/,
  /\b(circling back|ping|nudge|bumping)\b/,
];

const DEADLINE_PATTERNS = [
  /\b(deadline|due|due by|submit by|submission due)\b/,
  /\b(expires|expiring|offer ends|ending soon)\b/,
  /\b(last date|last day|closing on)\b/,
  /\b(by (today|tomorrow|eod|end of day|tonight))\b/,
];

const NEWSLETTER_PATTERNS = [
  /\bunsubscribe\b/,
  /\bnewsletter\b/,
  /\bdigest\b/,
  /\bsubscription\b/,
  /\bview in browser\b/,
  /\bmanage preferences\b/,
];

export const extractTextSignals = (subject, snippet) => {
  const combined = [subject, snippet].filter(Boolean).join(" ");
  const text = normalize(combined);

  return {
    text,
    hasReplyRequest: hasAny(text, REPLY_PATTERNS),
    hasFollowUp: hasAny(text, FOLLOW_UP_PATTERNS),
    hasDeadlinePhrase: hasAny(text, DEADLINE_PATTERNS),
    hasNewsletterText: hasAny(text, NEWSLETTER_PATTERNS),
    hasQuestionMark: text.includes("?"),
    includesAny,
  };
};
