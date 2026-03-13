import express from "express";
import { createOAuth2Client } from "./constants.js";
import { google } from "googleapis";
import userAuth from "../middlewares/auth.js";
import EmailAccount from "../models/EmailAccount.js";
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

  const emails = await Email.find({ userId }).sort({ date: -1 }).limit(20);

  res.json({
    emails,
    count: emails.length,
  });
});

export default gmailRouter;
