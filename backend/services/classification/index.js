import {
  getAutoSubmitted,
  getListId,
  getPrecedence,
  getReplyTo,
  hasAutoResponseSuppress,
  hasInReplyTo,
  hasListHeaders,
  hasListUnsubscribe,
  isAutoSubmitted,
} from "./headerSignals.js";
import { extractDeadlineDate } from "./dateExtractor.js";
import { extractTextSignals } from "./textSignals.js";
import {
  extractEmailAddress,
  getFromAddressSignals,
} from "./addressSignals.js";

const SPAM_LABELS = new Set(["SPAM", "TRASH"]);

const CATEGORY_LABELS = {
  CATEGORY_PROMOTIONS: "promotions",
  CATEGORY_SOCIAL: "social",
  CATEGORY_FORUMS: "forums",
  CATEGORY_UPDATES: "updates",
};

const SPAM_CATEGORIES = new Set([
  "spam",
  "promotions",
  "social",
  "forums",
  "updates",
  "newsletter",
  "subscription",
  "bulk",
  "auto",
]);

export const classifyEmail = ({
  subject,
  from,
  to,
  snippet,
  headers = [],
  labelIds = [],
  receivedAt,
}) => {
  const textSignals = extractTextSignals(subject, snippet);
  const { email: fromEmail, isNoReply, isAutoSender } =
    getFromAddressSignals(from);

  const listId = getListId(headers);
  const listUnsubscribe = hasListUnsubscribe(headers);
  const listHeaders = hasListHeaders(headers);
  const precedence = getPrecedence(headers);
  const autoSubmitted = getAutoSubmitted(headers);
  const autoSubmittedFlag = isAutoSubmitted(headers);
  const autoSuppress = hasAutoResponseSuppress(headers);
  const replyTo = getReplyTo(headers);
  const replyToEmail = extractEmailAddress(replyTo);
  const inReplyTo = hasInReplyTo(headers);

  const labelCategory = labelIds.find((label) => CATEGORY_LABELS[label]);

  let spamCategory = null;
  if (labelIds.some((label) => SPAM_LABELS.has(label))) {
    spamCategory = "spam";
  } else if (labelCategory) {
    spamCategory = CATEGORY_LABELS[labelCategory];
  } else if (listUnsubscribe || listId || listHeaders) {
    spamCategory = "newsletter";
  } else if (precedence.includes("bulk") || precedence.includes("list")) {
    spamCategory = "bulk";
  } else if (precedence.includes("junk")) {
    spamCategory = "spam";
  } else if (autoSubmittedFlag || autoSuppress || autoSubmitted) {
    spamCategory = "auto";
  } else if (isNoReply || isAutoSender) {
    spamCategory = "auto";
  } else if (textSignals.hasNewsletterText) {
    spamCategory = "newsletter";
  }

  const tags = new Set();
  if (spamCategory && SPAM_CATEGORIES.has(spamCategory)) {
    tags.add("spam");
  }

  const text = textSignals.text;

  const allowReplySignals =
    !spamCategory &&
    !listHeaders &&
    !listUnsubscribe &&
    !autoSubmittedFlag &&
    !autoSuppress &&
    !isNoReply;

  if (allowReplySignals) {
    const replySignals =
      textSignals.hasReplyRequest ||
      textSignals.hasQuestionMark ||
      (replyToEmail && replyToEmail !== fromEmail) ||
      (inReplyTo && textSignals.hasFollowUp);

    if (replySignals) {
      tags.add("needs_reply");
    }
  }

  if (textSignals.hasFollowUp && !isNoReply) {
    tags.add("follow_up");
  }

  let deadlineAt = null;
  if (textSignals.hasDeadlinePhrase) {
    deadlineAt = extractDeadlineDate(text, receivedAt);
    tags.add("deadline");
  } else {
    deadlineAt = extractDeadlineDate(text, receivedAt);
    if (deadlineAt) tags.add("deadline");
  }

  return {
    tags: Array.from(tags),
    spamCategory,
    deadlineAt,
  };
};
