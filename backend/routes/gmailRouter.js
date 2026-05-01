import express from "express";
import userAuth from "../middlewares/auth.js";
import { emailQueue } from "../queues/emailQueue.js";
import Email from "../models/Email.js";
import EmailEmbedding from "../models/EmailEmbedding.js";
import EmailAccount from "../models/EmailAccount.js";
import mongoose from "mongoose";
import { verifyPubSubJwt } from "../services/pubsubAuth.js";
import { createGmailClient } from "../services/gmailClient.js";
import { publishSocketEvent } from "../services/socketPubSub.js";
import {
  buildPlainText,
  buildRawHtml,
  buildSafeHtml,
  decodeBase64UrlToBuffer,
  extractMessageContent,
  getHeaderValue,
  normalizeContentId,
} from "../services/emailContent.js";
import { embedTexts } from "../services/embeddingService.js";
import { normalizeText } from "../services/textChunker.js";
import { upsertTagRules } from "../services/tagRulesService.js";

const gmailRouter = express.Router();

const toBoolean = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  return false;
};

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

const sanitizeFilename = (value) => {
  const cleaned = String(value || "attachment")
    .replace(/[\r\n"]/g, "")
    .trim();
  return cleaned.length ? cleaned : "attachment";
};

function getDateRangeBounds(range, tzOffsetMinutes = 0) {
  if (!range || range === "all") return null;

  const safeOffset = Number.isFinite(tzOffsetMinutes)
    ? Math.min(Math.max(tzOffsetMinutes, -840), 840)
    : 0;
  const offsetMs = safeOffset * 60 * 1000;
  const nowUtc = new Date();
  const nowLocal = new Date(nowUtc.getTime() + offsetMs);

  const getStartEndForLocalDate = (localDate) => {
    const year = localDate.getUTCFullYear();
    const month = localDate.getUTCMonth();
    const day = localDate.getUTCDate();

    const startUtc = new Date(Date.UTC(year, month, day) - offsetMs);
    const endUtc = new Date(
      Date.UTC(year, month, day, 23, 59, 59, 999) - offsetMs
    );

    return { start: startUtc, end: endUtc };
  };

  if (range === "today") {
    return getStartEndForLocalDate(nowLocal);
  }

  if (range === "yesterday") {
    const y = new Date(nowLocal);
    y.setUTCDate(y.getUTCDate() - 1);
    return getStartEndForLocalDate(y);
  }

  if (range === "week") {
    const start = new Date(nowLocal);
    start.setUTCDate(start.getUTCDate() - 6);
    const { start: startUtc } = getStartEndForLocalDate(start);
    return { start: startUtc, end: nowUtc };
  }

  if (range === "month") {
    const start = new Date(nowLocal);
    start.setUTCDate(start.getUTCDate() - 29);
    const { start: startUtc } = getStartEndForLocalDate(start);
    return { start: startUtc, end: nowUtc };
  }

  return null;
}

gmailRouter.post("/push", async (req, res) => {
  try {
    const audience = process.env.PUBSUB_PUSH_AUDIENCE;
    const serviceAccount = process.env.PUBSUB_PUSH_SERVICE_ACCOUNT;
    console.log("[pubsub] Push received");
    await verifyPubSubJwt(req.headers.authorization, audience, serviceAccount);
    console.log("[pubsub] JWT verified");

    const message = req.body?.message;
    if (!message?.data) {
      console.warn("[pubsub] Missing data");
      return res.status(400).json({ message: "Missing Pub/Sub data" });
    }

    let payload = null;
    try {
      payload = JSON.parse(
        Buffer.from(message.data, "base64").toString("utf-8")
      );
    } catch {
      console.warn("[pubsub] Invalid payload");
      return res.status(400).json({ message: "Invalid Pub/Sub payload" });
    }

    const emailAddress = payload?.emailAddress;
    const historyId = payload?.historyId;

    if (!emailAddress || !historyId) {
      console.warn("[pubsub] Missing emailAddress/historyId", payload);
      return res.status(400).json({ message: "Missing Gmail payload data" });
    }

    console.log("[pubsub] Enqueue incremental sync", {
      emailAddress,
      historyId,
    });
    await emailQueue.add("incremental-sync", {
      emailAddress,
      historyId,
    });

    return res.status(204).send();
  } catch (error) {
    console.error("[pubsub] Push failed", error?.message || error);
    const status = error?.message?.includes("Authorization") ? 401 : 500;
    return res.status(status).json({ message: "Pub/Sub push failed" });
  }
});

gmailRouter.get("/push/debug", userAuth, async (req, res) => {
  try {
    const accounts = await EmailAccount.find({ userId: req.user })
      .select("email lastHistoryId watchExpiration watchLabels watchTopic updatedAt")
      .sort({ updatedAt: -1 })
      .lean();

    return res.json({
      webhookPath: "/gmail/push",
      env: {
        hasPubSubTopic: Boolean(process.env.PUBSUB_TOPIC),
        pubSubTopic: process.env.PUBSUB_TOPIC || null,
        hasPushAudience: Boolean(process.env.PUBSUB_PUSH_AUDIENCE),
        pushAudience: process.env.PUBSUB_PUSH_AUDIENCE || null,
        hasPushServiceAccount: Boolean(process.env.PUBSUB_PUSH_SERVICE_ACCOUNT),
        pushServiceAccount: process.env.PUBSUB_PUSH_SERVICE_ACCOUNT || null,
        pubSubLabels: process.env.PUBSUB_LABELS || "INBOX",
      },
      accounts: accounts.map((account) => ({
        ...account,
        watchActive:
          account.watchExpiration instanceof Date
            ? account.watchExpiration.getTime() > Date.now()
            : false,
      })),
    });
  } catch (error) {
    console.error("[pubsub] Debug status failed", error?.message || error);
    return res.status(500).json({ message: "Failed to load push debug status" });
  }
});

// Adding Job into the emailQueue
gmailRouter.post("/initial-sync", userAuth, async (req, res) => {
  const userId = req.user;

  // Adding JOB -> (jobName,data) into emailQueue
  // Why JobName -> Queue can handle multiple jobs so in Worker if(job.name) == initial-sync-emails -> we do intialSync() like that
  await emailQueue.add("initial-sync-emails", {
    userId,
  });

  res.status(200).json({ message: "Email sync started" });
});

gmailRouter.get("/messages", userAuth, async (req, res) => {
  const userId = req.user;

  const query = { userId };
  const account = req.query.account;
  const range = (req.query.range || "all").toLowerCase();
  const tagsParam = req.query.tags || req.query.tag;
  const tags = tagsParam
    ? String(tagsParam)
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    : [];
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const skip = (page - 1) * limit;
  const tzOffset = parseInt(req.query.tzOffset, 10);

  if (account) {
    query.account = account;
  }

  const bounds = getDateRangeBounds(range, tzOffset);
  if (bounds) {
    query.receivedAt = { $gte: bounds.start, $lte: bounds.end };
  }
  if (tags.length) {
    query.tags = { $in: tags };
  }

  const [emails, total] = await Promise.all([
    Email.find(query)
      .sort({ receivedAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Email.countDocuments(query),
  ]);

  res.json({
    emails,
    count: emails.length,
    total,
    page,
    limit,
    hasNext: page * limit < total,
  });
});

gmailRouter.get("/tag-counts", userAuth, async (req, res) => {
  try {
    const userId = req.user;
    const account = req.query.account;
    const range = (req.query.range || "all").toLowerCase();
    const tzOffset = parseInt(req.query.tzOffset, 10);

    const match = { userId };
    if (account) {
      match.account = account;
    }

    const bounds = getDateRangeBounds(range, tzOffset);
    if (bounds) {
      match.receivedAt = { $gte: bounds.start, $lte: bounds.end };
    }

    const tagKeys = ["needs_reply", "deadline", "follow_up", "spam"];

    const results = await Email.aggregate([
      { $match: match },
      { $unwind: "$tags" },
      { $match: { tags: { $in: tagKeys } } },
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

    return res.json({ counts });
  } catch (error) {
    console.error("[gmail] Tag counts failed", error?.message || error);
    return res.status(500).json({ message: "Failed to load tag counts" });
  }
});

gmailRouter.get("/search", userAuth, async (req, res) => {
  try {
    const userId = req.user;
    const queryRaw = req.query.q || req.query.query || "";
    const queryText = normalizeText(queryRaw);
    if (!queryText) {
      return res.status(400).json({ message: "Missing query text" });
    }

    const account = req.query.account;
    const range = (req.query.range || "all").toLowerCase();
    const tzOffset = parseInt(req.query.tzOffset, 10);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 10, 1),
      50
    );
    const labelsParam = req.query.labels;
    const labels = labelsParam
      ? String(labelsParam)
          .split(",")
          .map((label) => label.trim())
          .filter(Boolean)
      : [];

    let userObjectId;
    try {
      userObjectId = new mongoose.Types.ObjectId(userId);
    } catch (error) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    let queryVector = null;
    try {
      const vectors = await embedTexts([queryText]);
      queryVector = vectors?.[0];
    } catch (error) {
      console.error("[search] Embedding failed", error);
      return res.status(500).json({
        message: "Embedding failed",
        ...(process.env.NODE_ENV !== "production" && {
          details: error?.message || String(error),
        }),
      });
    }

    if (!queryVector?.length) {
      return res.status(500).json({ message: "Embedding failed" });
    }

    const filter = {
      userId: userObjectId,
    };

    if (account) {
      filter.account = account;
    }

    const bounds = getDateRangeBounds(range, tzOffset);
    if (bounds) {
      filter.receivedAt = { $gte: bounds.start, $lte: bounds.end };
    }

    if (labels.length) {
      filter.labels = { $in: labels };
    }

    const searchLimit = Math.min(limit * 3, 60);
    const numCandidates = Math.min(searchLimit * 20, 1000);

    const pipeline = [
      {
        $vectorSearch: {
          index: "email_embeddings_vector",
          path: "embedding",
          queryVector,
          numCandidates,
          limit: searchLimit,
          filter,
        },
      },
      {
        $project: {
          _id: 0,
          chunkText: 1,
          threadId: 1,
          messageId: 1,
          account: 1,
          receivedAt: 1,
          subject: 1,
          from: 1,
          labels: 1,
          tags: 1,
          score: { $meta: "vectorSearchScore" },
        },
      },
    ];

    let rawResults = [];
    try {
      rawResults = await EmailEmbedding.aggregate(pipeline);
    } catch (error) {
      console.error("[search] Vector search failed", error);
      return res.status(500).json({
        message: "Vector search failed",
        ...(process.env.NODE_ENV !== "production" && {
          details: error?.message || String(error),
        }),
      });
    }

    const grouped = new Map();
    rawResults.forEach((item) => {
      const key = `${item.account || ""}::${item.threadId || item.messageId}`;
      const current = grouped.get(key);
      if (!current || item.score > current.score) {
        grouped.set(key, item);
      }
    });

    const results = Array.from(grouped.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return res.json({
      query: queryText,
      count: results.length,
      results,
    });
  } catch (error) {
    console.error("[search] semantic search failed", error);
    return res.status(500).json({ message: "Semantic search failed" });
  }
});

gmailRouter.get("/threads/:threadId", userAuth, async (req, res) => {
  try {
    const userId = req.user;
    const { threadId } = req.params;
    const accountEmail = req.query.account;

    const account = await resolveAccountForThread({
      userId,
      accountEmail,
      threadId,
    });

    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    const gmail = createGmailClient(account);
    const threadResponse = await gmail.users.threads.get({
      userId: "me",
      id: threadId,
      format: "full",
    });

    const threadMessages = (threadResponse.data?.messages || []).map(
      (message) => {
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
        const labelIds = message.labelIds || [];

        const content = extractMessageContent(message);

        const attachments = content.attachments.map((attachment) => {
          const filename = sanitizeFilename(attachment.filename);
          const mimeType = attachment.mimeType || "application/octet-stream";
          const disposition = attachment.inline ? "inline" : "attachment";

          let url = null;
          let dataUrl = null;

          if (attachment.attachmentId) {
            url = `/gmail/messages/${message.id}/attachments/${attachment.attachmentId}?account=${encodeURIComponent(
              account.email
            )}&mimeType=${encodeURIComponent(
              mimeType
            )}&filename=${encodeURIComponent(
              filename
            )}&disposition=${encodeURIComponent(disposition)}`;
          } else if (attachment.data) {
            const buffer = decodeBase64UrlToBuffer(attachment.data);
            dataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
          }

          return {
            ...attachment,
            filename,
            mimeType,
            url,
            dataUrl,
          };
        });

        const inlineCidMap = attachments.reduce((acc, attachment) => {
          if (attachment.inline && attachment.contentId) {
            const inlineSrc = attachment.url || attachment.dataUrl;
            if (inlineSrc) {
              acc[normalizeContentId(attachment.contentId)] = inlineSrc;
            }
          }
          return acc;
        }, {});

        const bodyHtml = buildSafeHtml({
          html: content.html,
          inlineCidMap,
          stripImages: false,
        });
        const bodyHtmlNoImages = buildSafeHtml({
          html: content.html,
          inlineCidMap,
          stripImages: true,
        });
        const bodyHtmlRaw = buildRawHtml({
          html: content.html,
          inlineCidMap,
        });
        const bodyText = buildPlainText({
          text: content.text,
          html: bodyHtmlNoImages || content.html,
        });

        return {
          id: message.id,
          threadId: message.threadId,
          subject,
          from,
          to,
          date,
          receivedAt,
          snippet: message.snippet,
          bodyHtml,
          bodyHtmlNoImages,
          bodyHtmlRaw,
          bodyText,
          hasImages: content.hasImages,
          attachments,
          isUnread: labelIds.includes("UNREAD"),
        };
      }
    );

    threadMessages.sort((a, b) => {
      const aTime = a?.receivedAt ? new Date(a.receivedAt).getTime() : 0;
      const bTime = b?.receivedAt ? new Date(b.receivedAt).getTime() : 0;
      return aTime - bTime;
    });

    const threadIsUnread = threadMessages.some((msg) => msg.isUnread);
    await Email.updateOne(
      { userId, threadId, account: account.email },
      { isUnread: threadIsUnread }
    );

    res.json({
      threadId,
      account: account.email,
      isUnread: threadIsUnread,
      messages: threadMessages,
    });
  } catch (error) {
    console.error("[gmail] Thread fetch failed", error?.message || error);
    res.status(500).json({ message: "Failed to load thread" });
  }
});

gmailRouter.patch("/threads/:threadId/read", userAuth, async (req, res) => {
  try {
    const userId = req.user;
    const { threadId } = req.params;
    const accountEmail = req.query.account;
    const unread = toBoolean(req.body?.unread);

    const account = await resolveAccountForThread({
      userId,
      accountEmail,
      threadId,
    });

    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    const gmail = createGmailClient(account);
    const requestBody = unread
      ? { addLabelIds: ["UNREAD"] }
      : { removeLabelIds: ["UNREAD"] };

    await gmail.users.threads.modify({
      userId: "me",
      id: threadId,
      requestBody,
    });

    await Email.updateOne(
      { userId, threadId, account: account.email },
      { isUnread: unread }
    );

    await publishSocketEvent(
      "email-updated",
      {
        account: account.email,
        threadId,
        isUnread: unread,
      },
      userId.toString()
    );

    res.json({
      threadId,
      account: account.email,
      isUnread: unread,
    });
  } catch (error) {
    console.error("[gmail] Update read state failed", error?.message || error);
    res.status(500).json({ message: "Failed to update read state" });
  }
});

gmailRouter.post("/tag-feedback", userAuth, async (req, res) => {
  try {
    const userId = req.user;
    const { threadId, account, tags, applySimilarity } = req.body || {};

    if (!threadId) {
      return res.status(400).json({ message: "threadId is required." });
    }

    const allowedTags = new Set([
      "needs_reply",
      "deadline",
      "follow_up",
      "spam",
    ]);
    const hasTagsParam = Array.isArray(tags);
    const nextTags = hasTagsParam
      ? tags.filter((tag) => allowedTags.has(tag))
      : [];

    const email = await Email.findOne({
      userId,
      threadId,
      ...(account ? { account } : {}),
    });

    if (!email) {
      return res.status(404).json({ message: "Thread not found." });
    }

    if (hasTagsParam) {
      await Email.updateOne(
        { _id: email._id },
        {
          $set: {
            tags: nextTags,
            spamCategory: nextTags.includes("spam")
              ? email.spamCategory || "manual"
              : email.spamCategory,
          },
        }
      );
    }

    if (nextTags.length) {
      await upsertTagRules({
        userId,
        from: email.from,
        subject: email.subject,
        tags: nextTags,
        sourceThreadId: email.threadId,
        sourceAccount: email.account,
      });
    }

    let similarityTagged = 0;
    if (applySimilarity && nextTags.length) {
      const seedEmbedding = await EmailEmbedding.findOne({
        userId,
        account: email.account,
        threadId: email.threadId,
        embedding: { $exists: true },
      }).lean();

      if (seedEmbedding?.embedding?.length) {
        const similar = await EmailEmbedding.aggregate([
          {
            $vectorSearch: {
              index: "email_embeddings_vector",
              path: "embedding",
              queryVector: seedEmbedding.embedding,
              numCandidates: 200,
              limit: 50,
              filter: {
                userId: email.userId,
                account: email.account,
              },
            },
          },
          {
            $project: {
              threadId: 1,
              score: { $meta: "vectorSearchScore" },
            },
          },
        ]);

        const matchedThreadIds = similar
          .filter((item) => item.score >= 0.86 && item.threadId)
          .map((item) => item.threadId);

        if (matchedThreadIds.length) {
          const emailResult = await Email.updateMany(
            {
              userId,
              account: email.account,
              threadId: { $in: matchedThreadIds },
            },
            { $addToSet: { tags: { $each: nextTags } } }
          );
          similarityTagged = emailResult.modifiedCount || 0;

          await EmailEmbedding.updateMany(
            {
              userId,
              account: email.account,
              threadId: { $in: matchedThreadIds },
            },
            { $addToSet: { tags: { $each: nextTags } } }
          );
        }
      }
    }

    return res.json({
      ok: true,
      tags: nextTags,
      similarityTagged,
    });
  } catch (error) {
    console.error("[tag-feedback] failed", error);
    return res.status(500).json({ message: "Failed to save tag feedback." });
  }
});

gmailRouter.get(
  "/messages/:messageId/attachments/:attachmentId",
  userAuth,
  async (req, res) => {
    try {
      const userId = req.user;
      const { messageId, attachmentId } = req.params;
      const accountEmail = req.query.account;
      const mimeType =
        req.query.mimeType || "application/octet-stream";
      const filename = sanitizeFilename(req.query.filename);
      const disposition =
        req.query.disposition === "inline" ? "inline" : "attachment";

      if (!accountEmail) {
        return res.status(400).json({ message: "Missing account" });
      }

      const account = await EmailAccount.findOne({
        userId,
        email: accountEmail,
      });

      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }

      const gmail = createGmailClient(account);
      const attachmentResponse = await gmail.users.messages.attachments.get({
        userId: "me",
        messageId,
        id: attachmentId,
      });

      const data = attachmentResponse?.data?.data;
      if (!data) {
        return res.status(404).json({ message: "Attachment not found" });
      }

      const buffer = decodeBase64UrlToBuffer(data);

      res.setHeader("Content-Type", mimeType);
      res.setHeader(
        "Content-Disposition",
        `${disposition}; filename="${filename}"`
      );
      res.send(buffer);
    } catch (error) {
      console.error("[gmail] Attachment fetch failed", error?.message || error);
      res.status(500).json({ message: "Failed to fetch attachment" });
    }
  }
);

export default gmailRouter;
