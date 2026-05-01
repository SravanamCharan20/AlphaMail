import mongoose from "mongoose";
import Email from "../../models/Email.js";
import EmailEmbedding from "../../models/EmailEmbedding.js";
import EmailAccount from "../../models/EmailAccount.js";
import { createGmailClient } from "../gmailClient.js";
import {
  buildPlainText,
  extractMessageContent,
  getHeaderValue,
} from "../emailContent.js";
import { embedTexts } from "../embeddingService.js";
import { normalizeText } from "../textChunker.js";

const ALLOWED_TAGS = new Set([
  "needs_reply",
  "deadline",
  "follow_up",
  "spam",
]);

const clampLimit = (value, fallback = 5, max = 10) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(Math.max(Math.trunc(num), 1), max);
};

const normalizeTags = (tags = []) =>
  Array.isArray(tags)
    ? tags.filter((tag) => ALLOWED_TAGS.has(tag))
    : [];

const getDateRangeBounds = (range) => {
  const normalized = String(range || "all").toLowerCase();
  if (normalized === "all") return null;

  const now = new Date();
  const startOfDay = (date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const endOfDay = (date) =>
    new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      23,
      59,
      59,
      999
    );

  if (normalized === "today") {
    return { start: startOfDay(now), end: endOfDay(now) };
  }

  if (normalized === "yesterday") {
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    return { start: startOfDay(y), end: endOfDay(y) };
  }

  if (normalized === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    return { start: startOfDay(start), end: now };
  }

  if (normalized === "month") {
    const start = new Date(now);
    start.setDate(now.getDate() - 29);
    return { start: startOfDay(start), end: now };
  }

  return null;
};

const buildEmailQuery = ({ userId, account, range, tags }) => {
  const query = { userId };

  if (account) {
    query.account = account;
  }

  const bounds = getDateRangeBounds(range);
  if (bounds) {
    query.receivedAt = { $gte: bounds.start, $lte: bounds.end };
  }

  const normalizedTags = normalizeTags(tags);
  if (normalizedTags.length) {
    query.tags = { $in: normalizedTags };
  }

  return query;
};

const mapEmailSummary = (email) => ({
  threadId: email.threadId,
  account: email.account,
  subject: email.subject || "",
  from: email.from || "",
  to: email.to || "",
  snippet: email.snippet || "",
  receivedAt: email.receivedAt || null,
  isUnread: Boolean(email.isUnread),
  tags: Array.isArray(email.tags) ? email.tags : [],
});

const resolveAccountForThread = async ({ userId, accountEmail, threadId }) => {
  if (accountEmail) {
    return EmailAccount.findOne({ userId, email: accountEmail });
  }
  if (!threadId) return null;

  const emailRecord = await Email.findOne({ userId, threadId })
    .select("account")
    .lean();

  if (!emailRecord?.account) return null;
  return EmailAccount.findOne({ userId, email: emailRecord.account });
};

const fetchThreadDetails = async ({ userId, threadId, account }) => {
  const accountRecord = await resolveAccountForThread({
    userId,
    accountEmail: account,
    threadId,
  });

  if (!accountRecord) {
    throw new Error("Account not found for thread");
  }

  const gmail = createGmailClient(accountRecord);
  const threadResponse = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "full",
  });

  const messages = (threadResponse.data?.messages || []).map((message) => {
    const headers = message.payload?.headers || [];
    const subject = getHeaderValue(headers, "Subject");
    const from = getHeaderValue(headers, "From");
    const to = getHeaderValue(headers, "To");
    const date = getHeaderValue(headers, "Date");
    const internalDateMs = Number(message.internalDate);
    const receivedAt = Number.isFinite(internalDateMs)
      ? new Date(internalDateMs)
      : date
      ? new Date(date)
      : null;

    const content = extractMessageContent(message);
    const bodyText = buildPlainText({
      text: content.text,
      html: content.html,
    });

    return {
      id: message.id,
      threadId: message.threadId,
      subject: subject || "",
      from: from || "",
      to: to || "",
      snippet: message.snippet || "",
      bodyText: bodyText || "",
      receivedAt,
      isUnread: Array.isArray(message.labelIds)
        ? message.labelIds.includes("UNREAD")
        : false,
    };
  });

  messages.sort((a, b) => {
    const aTime = a.receivedAt ? new Date(a.receivedAt).getTime() : 0;
    const bTime = b.receivedAt ? new Date(b.receivedAt).getTime() : 0;
    return aTime - bTime;
  });

  return {
    threadId,
    account: accountRecord.email,
    messages,
  };
};

const semanticSearchEmails = async ({ userId, query, account, range, tags, limit }) => {
  const queryText = normalizeText(query || "");
  if (!queryText) return [];

  let userObjectId;
  try {
    userObjectId = new mongoose.Types.ObjectId(userId);
  } catch {
    return [];
  }

  const vectors = await embedTexts([queryText]);
  const queryVector = vectors?.[0];
  if (!queryVector?.length) return [];

  const filter = {
    userId: userObjectId,
  };

  if (account) {
    filter.account = account;
  }

  const bounds = getDateRangeBounds(range);
  if (bounds) {
    filter.receivedAt = { $gte: bounds.start, $lte: bounds.end };
  }

  const normalizedTags = normalizeTags(tags);
  if (normalizedTags.length) {
    filter.tags = { $in: normalizedTags };
  }

  const rawResults = await EmailEmbedding.aggregate([
    {
      $vectorSearch: {
        index: "email_embeddings_vector",
        path: "embedding",
        queryVector,
        numCandidates: Math.min(limit * 20, 200),
        limit: Math.min(limit * 3, 30),
        filter,
      },
    },
    {
      $project: {
        _id: 0,
        threadId: 1,
        account: 1,
        subject: 1,
        from: 1,
        labels: 1,
        tags: 1,
        receivedAt: 1,
        chunkText: 1,
        score: { $meta: "vectorSearchScore" },
      },
    },
  ]);

  const grouped = new Map();
  rawResults.forEach((item) => {
    const key = `${item.account || ""}::${item.threadId || ""}`;
    const current = grouped.get(key);
    if (!current || item.score > current.score) {
      grouped.set(key, item);
    }
  });

  return Array.from(grouped.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => ({
      threadId: item.threadId,
      account: item.account,
      subject: item.subject || "",
      from: item.from || "",
      snippet: item.chunkText || "",
      receivedAt: item.receivedAt || null,
      tags: Array.isArray(item.tags) ? item.tags : [],
      searchScore: item.score,
    }));
};

export const toolHandlers = {
  async search_emails({ userId, args = {} }) {
    const query = String(args.query || "").trim();
    const account = String(args.account || "").trim() || null;
    const range = String(args.range || "all").toLowerCase();
    const limit = clampLimit(args.limit, 5, 10);
    const tags = normalizeTags(args.tags);

    if (query) {
      const semanticResults = await semanticSearchEmails({
        userId,
        query,
        account,
        range,
        tags,
        limit,
      });

      if (semanticResults.length) {
        return {
          mode: "semantic",
          count: semanticResults.length,
          results: semanticResults,
        };
      }
    }

    const mongoQuery = buildEmailQuery({
      userId,
      account,
      range,
      tags,
    });

    if (query) {
      mongoQuery.$or = [
        { subject: { $regex: query, $options: "i" } },
        { from: { $regex: query, $options: "i" } },
        { snippet: { $regex: query, $options: "i" } },
      ];
    }

    const emails = await Email.find(mongoQuery)
      .sort({ receivedAt: -1, _id: -1 })
      .limit(limit)
      .lean();

    return {
      mode: query ? "keyword-fallback" : "filter-only",
      count: emails.length,
      results: emails.map(mapEmailSummary),
    };
  },

  async get_tag_counts({ userId, args = {} }) {
    const account = String(args.account || "").trim() || null;
    const range = String(args.range || "all").toLowerCase();

    const match = buildEmailQuery({
      userId,
      account,
      range,
      tags: [],
    });

    const results = await Email.aggregate([
      { $match: match },
      { $unwind: "$tags" },
      {
        $match: {
          tags: { $in: ["needs_reply", "deadline", "follow_up", "spam"] },
        },
      },
      { $group: { _id: "$tags", count: { $sum: 1 } } },
    ]);

    const counts = {
      needs_reply: 0,
      deadline: 0,
      follow_up: 0,
      spam: 0,
    };

    results.forEach((row) => {
      if (row?._id) {
        counts[row._id] = row.count || 0;
      }
    });

    return counts;
  },

  async get_thread({ userId, args = {} }) {
    const threadId = String(args.threadId || "").trim();
    const account = String(args.account || "").trim();

    if (!threadId || !account) {
      throw new Error("threadId and account are required");
    }

    return fetchThreadDetails({
      userId,
      threadId,
      account,
    });
  },
};
