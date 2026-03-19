const normalize = (value) => String(value || "").toLowerCase();

const EMAIL_REGEX = /([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i;

export const extractEmailAddress = (value) => {
  if (!value) return "";
  const match = String(value).match(EMAIL_REGEX);
  return match ? match[1].toLowerCase() : "";
};

export const extractDomain = (email) => {
  if (!email) return "";
  const parts = email.split("@");
  return parts.length === 2 ? parts[1] : "";
};

export const getFromAddressSignals = (from) => {
  const normalized = normalize(from);
  const email = extractEmailAddress(normalized);
  const domain = extractDomain(email);

  const noReplyPattern =
    /no[-_. ]?reply|do[-_. ]?not[-_. ]?reply|donotreply|noreply|mailer[-_. ]?daemon|postmaster/;
  const isNoReply = noReplyPattern.test(normalized) || noReplyPattern.test(email);

  const autoSenderPattern =
    /mailer[-_. ]?daemon|postmaster|bounce|delivery status notification|auto[-_. ]?generated/;
  const isAutoSender = autoSenderPattern.test(normalized);

  return {
    email,
    domain,
    isNoReply,
    isAutoSender,
  };
};
