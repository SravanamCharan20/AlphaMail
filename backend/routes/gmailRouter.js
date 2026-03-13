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

    const userConnectedMails = await EmailAccount.find({ userId }).select(
      "email accessToken refreshToken -_id"
    );

    const emails = [];
    let cnt = 0;
    // console.log(userConnectedMails);
    for (const account of userConnectedMails) {
      const oauth2Client = createOAuth2Client();
      oauth2Client.setCredentials({
        access_token: account.accessToken,
        refresh_token: account.refreshToken,
      });

      const gmail = google.gmail({
        version: "v1",
        auth: oauth2Client,
      });
      const list = await gmail.users.messages.list({ // -> 1Api Call
        userId: "me",
        maxResults: 10,
      });

      //   console.log(res.data.messages);
      for (const msg of list.data.messages) { // 10 -> API calls 
        const email = await gmail.users.messages.get({
          userId: "me",
          id: msg.id,
        });

        const headers = email.data.payload.headers;

        const subject = headers.find((h) => h.name === "Subject")?.value;
        const from = headers.find((h) => h.name === "From")?.value;
        const date = headers.find((h) => h.name === "Date")?.value;

        // const payload = email.data.payload;
        // const body = getEmailBody(payload);
        // console.log("BODY : ",body);

        emails.push({
          account: account.email,
          subject,
          from,
          date,
          snippet: email.data.snippet,
        });
        cnt ++;
      }

      // total calls are 11 * (connected accounts);
    }
    return res.status(200).json({
        emails,
        count : cnt,
    });
  } catch (error) {
    console.log(error.message);
  }
});

export default gmailRouter;
