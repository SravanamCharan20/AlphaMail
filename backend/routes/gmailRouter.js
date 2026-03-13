import express from "express";
import { createOAuth2Client } from "./constants.js";
import { google } from "googleapis";
import userAuth from "../middlewares/auth.js";
import EmailAccount from "../models/EmailAccount.js";

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

gmailRouter.get("/messages", userAuth, async (req, res) => {
    try {
      const userId = req.user;
  
      const accounts = await EmailAccount.find({ userId })
        .select("email accessToken refreshToken -_id");
  
      const emails = [];
  
      for (const account of accounts) {
  
        const oauth2Client = createOAuth2Client();
  
        oauth2Client.setCredentials({
          access_token: account.accessToken,
          refresh_token: account.refreshToken,
        });
  
        const gmail = google.gmail({
          version: "v1",
          auth: oauth2Client,
        });
  
        const threads = await gmail.users.threads.list({
          userId: "me",
          maxResults: 10,
        });
  
        for (const thread of threads.data.threads) {
  
          const threadData = await gmail.users.threads.get({
            userId: "me",
            id: thread.id,
          });
  
          const message =
            threadData.data.messages[threadData.data.messages.length - 1];
  
          const headers = message.payload.headers;
  
          const subject = headers.find(h => h.name === "Subject")?.value;
          const from = headers.find(h => h.name === "From")?.value;
          const date = headers.find(h => h.name === "Date")?.value;
  
          emails.push({
            account: account.email,
            subject,
            from,
            date,
            snippet: message.snippet,
          });
  
        }
      }
  
      return res.status(200).json({
        emails,
        count: emails.length,
      });
  
    } catch (error) {
      console.log(error.message);
    }
  });

export default gmailRouter;
