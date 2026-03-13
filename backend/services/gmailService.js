import { google } from "googleapis";
import EmailAccount from "../models/EmailAccount.js";
import Email from "../models/Email.js";
import { createOAuth2Client } from "../routes/constants.js";

export const syncUserEmails = async (userId) => {
  try {
    const accounts = await EmailAccount.find({ userId }).select(
      "email accessToken refreshToken"
    );

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

      if (!threads.data.threads) continue;

      // 🔹 Fetch all thread details in parallel
      const threadDetails = await Promise.all(
        threads.data.threads.map((thread) =>
          gmail.users.threads.get({
            userId: "me",
            id: thread.id,
          })
        )
      );

      for (const threadData of threadDetails) {
        const message =
          threadData.data.messages[threadData.data.messages.length - 1];

        const headers = message.payload.headers;

        const subject = headers.find((h) => h.name === "Subject")?.value;
        const from = headers.find((h) => h.name === "From")?.value;
        const date = headers.find((h) => h.name === "Date")?.value;

        await Email.updateOne(
          { threadId: threadData.data.id },
          {
            account: account.email,
            threadId: threadData.data.id,
            subject,
            from,
            date,
            snippet: message.snippet,
            userId,
          },
          { upsert: true }
        );
      }
    }

    console.log("Email sync completed for user:", userId);
  } catch (error) {
    console.error("Email sync failed:", error.message);
  }
};
