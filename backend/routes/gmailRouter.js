import express from "express";
import userAuth from "../middlewares/auth.js";
import { emailQueue } from "../queues/emailQueue.js";
import Email from "../models/Email.js";
import { verifyPubSubJwt } from "../services/pubsubAuth.js";

const gmailRouter = express.Router();

function getEmailBody(payload) {
  if (payload.body && payload.body.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf8");
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        return Buffer.from(part.body.data, "base64").toString("utf8");
      }

      if (part.mimeType === "text/plain" && part.body?.data) {
        return Buffer.from(part.body.data, "base64").toString("utf8");
      }
    }
  }

  return null;
}

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

export default gmailRouter;
