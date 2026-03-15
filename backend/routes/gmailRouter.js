import express from "express";
import userAuth from "../middlewares/auth.js";
import { emailQueue } from "../queues/emailQueue.js";
import Email from "../models/Email.js";

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

function getDateRangeBounds(range) {
  if (!range || range === "all") return null;

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

  if (range === "today") {
    return { start: startOfDay(now), end: endOfDay(now) };
  }

  if (range === "yesterday") {
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    return { start: startOfDay(y), end: endOfDay(y) };
  }

  if (range === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    return { start: startOfDay(start), end: now };
  }

  if (range === "month") {
    const start = new Date(now);
    start.setDate(now.getDate() - 29);
    return { start: startOfDay(start), end: now };
  }

  return null;
}

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
  const range = req.query.range;

  if (account) {
    query.account = account;
  }

  const bounds = getDateRangeBounds(range);
  if (bounds) {
    query.receivedAt = { $gte: bounds.start, $lte: bounds.end };
  }

  const emails = await Email.find(query)
    .sort({ receivedAt: -1, date: -1 })
    .limit(20);

  res.json({
    emails,
    count: emails.length,
  });
});

export default gmailRouter;
