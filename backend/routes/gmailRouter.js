import express from "express";
import userAuth from "../middlewares/auth.js";
import { emailQueue } from "../queues/emailQueue.js";
import Email from "../models/Email.js";
import EmailAccount from "../models/EmailAccount.js";
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

const gmailRouter = express.Router();

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
    const unread = Boolean(req.body?.unread);

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
