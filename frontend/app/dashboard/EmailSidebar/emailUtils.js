export const getEmailSignature = (email) => {
  if (!email) return "unknown";
  if (email._id) return `id:${email._id}`;
  if (email.threadId) {
    const account = email.account ?? "";
    return `thread:${account}:${email.threadId}`;
  }

  const account = email.account ?? "";
  const subject = email.subject ?? "";
  const from = email.from ?? "";
  const date = email.date ?? "";
  const snippet = email.snippet ?? "";

  return `sig:${account}|${subject}|${from}|${date}|${snippet}`;
};

export const getThreadKey = (email) => {
  if (!email) return "";
  const account = email.account ?? "";
  const threadId = email.threadId ?? "";
  return `${account}::${threadId}`;
};

export const getEmailIdentity = (email) => {
  if (!email) return "";
  if (email.account && email.threadId) return getThreadKey(email);
  return getEmailSignature(email);
};

export const mergeEmails = (list, incoming) => {
  const seen = new Set();
  const merged = [];

  for (const email of [incoming, ...list]) {
    const key = getEmailIdentity(email);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(email);
  }

  return merged;
};

export const dedupeEmails = (emails) => {
  const seen = new Set();
  return emails.filter((email) => {
    const key = getEmailIdentity(email);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const getEmailTimestamp = (email) => {
  const candidate = email?.receivedAt || email?.date;
  if (!candidate) return 0;
  const parsed = new Date(candidate);
  const value = parsed.getTime();
  return Number.isNaN(value) ? 0 : value;
};

export const sortEmails = (emails) =>
  [...emails].sort((a, b) => {
    const diff = getEmailTimestamp(b) - getEmailTimestamp(a);
    if (diff !== 0) return diff;
    if (a?._id && b?._id) {
      return a._id < b._id ? 1 : -1;
    }
    return 0;
  });
