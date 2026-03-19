import TagRule from "../models/TagRule.js";
import { extractEmailAddress, extractDomain } from "./classification/addressSignals.js";

const normalize = (value) => String(value || "").toLowerCase().trim();

const normalizeSubject = (subject) => {
  if (!subject) return "";
  let s = normalize(subject);
  // strip common prefixes repeatedly
  let changed = true;
  while (changed) {
    changed = false;
    const next = s.replace(/^(re|fwd|fw)\s*:\s*/i, "");
    if (next !== s) {
      s = next.trim();
      changed = true;
    }
  }
  return s;
};

const uniq = (values) => Array.from(new Set(values.filter(Boolean)));

export const getRuleKeysForEmail = ({ from, subject }) => {
  const email = extractEmailAddress(from);
  const domain = extractDomain(email);
  const normalizedSubject = normalizeSubject(subject);
  return uniq([
    email ? `sender:${email}` : null,
    domain ? `domain:${domain}` : null,
    normalizedSubject ? `subject:${normalizedSubject}` : null,
  ]);
};

export const applyTagRules = async ({ userId, from, subject, tags = [] }) => {
  const email = extractEmailAddress(from);
  const domain = extractDomain(email);
  const normalizedSubject = normalizeSubject(subject);

  const ruleQuery = {
    userId,
    $or: [
      email ? { type: "sender", value: email } : null,
      domain ? { type: "domain", value: domain } : null,
      normalizedSubject ? { type: "subject", value: normalizedSubject } : null,
    ].filter(Boolean),
  };

  if (!ruleQuery.$or.length) return tags;

  const rules = await TagRule.find(ruleQuery).lean();
  const ruleTags = rules.flatMap((rule) => rule.tags || []);
  return uniq([...(tags || []), ...ruleTags]);
};

export const upsertTagRules = async ({
  userId,
  from,
  subject,
  tags,
  sourceThreadId,
  sourceAccount,
}) => {
  const email = extractEmailAddress(from);
  const domain = extractDomain(email);
  const normalizedSubject = normalizeSubject(subject);
  const updates = [];

  const upsertRule = async (type, value) => {
    if (!value) return;
    await TagRule.updateOne(
      { userId, type, value },
      {
        $set: {
          tags,
          sourceThreadId: sourceThreadId || null,
          sourceAccount: sourceAccount || null,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );
  };

  updates.push(upsertRule("sender", email));
  updates.push(upsertRule("domain", domain));
  updates.push(upsertRule("subject", normalizedSubject));

  await Promise.all(updates);
};
