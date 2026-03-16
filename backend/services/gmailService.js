import { google } from "googleapis";
import EmailAccount from "../models/EmailAccount.js";
import Email from "../models/Email.js";
import { createOAuth2Client } from "../routes/constants.js";
import { publishSocketEvent } from "./socketPubSub.js";


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
        maxResults: 100,
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
        const internalDateMs = Number(message.internalDate);
        const receivedAt = Number.isFinite(internalDateMs)
          ? new Date(internalDateMs)
          : date
          ? new Date(date)
          : null;

        await Email.updateOne(
          { userId, account: account.email, threadId: threadData.data.id },
          {
            account: account.email,
            threadId: threadData.data.id,
            subject,
            from,
            date,
            receivedAt,
            snippet: message.snippet,
            userId,
            syncSource: "initial",
            lastSyncedAt: new Date(),
          },
          { upsert: true }
        );
        await publishSocketEvent(
          "email-added",
          {
            account: account.email,
            threadId: threadData.data.id,
            subject,
            from,
            date,
            receivedAt,
            snippet: message.snippet,
            isIncremental: false,
          },
          userId.toString()
        );
      }
    }

    console.log("Email sync completed for user:", userId);
  } catch (error) {
    console.error("Email sync failed:", error.message);
  }
};

export const watchMailboxForAccount = async (account) => {
  const topicName = process.env.PUBSUB_TOPIC;
  if (!topicName) {
    throw new Error("PUBSUB_TOPIC is not configured");
  }

  const labelIds = process.env.PUBSUB_LABELS
    ? process.env.PUBSUB_LABELS.split(",").map((label) => label.trim()).filter(Boolean)
    : ["INBOX"];

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: account.accessToken,
    refresh_token: account.refreshToken,
  });

  const gmail = google.gmail({
    version: "v1",
    auth: oauth2Client,
  });

  const response = await gmail.users.watch({
    userId: "me",
    requestBody: {
      topicName,
      labelIds,
    },
  });

  const historyId = response?.data?.historyId;
  const expirationMs = Number(response?.data?.expiration);
  console.log("[gmail] Watch registered", {
    account: account.email,
    historyId,
    expiration: expirationMs,
  });

  await EmailAccount.updateOne(
    { _id: account._id },
    {
      lastHistoryId: historyId,
      watchExpiration: Number.isFinite(expirationMs)
        ? new Date(expirationMs)
        : undefined,
      watchLabels: labelIds,
      watchTopic: topicName,
    }
  );

  return response?.data;
};

export const syncIncrementalForAccount = async ({ emailAddress, historyId }) => {
  console.log("[gmail] Incremental sync start", { emailAddress, historyId });
  const account = await EmailAccount.findOne({ email: emailAddress });
  if (!account) {
    console.warn("[gmail] No account for email", emailAddress);
    return;
  }

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: account.accessToken,
    refresh_token: account.refreshToken,
  });

  const gmail = google.gmail({
    version: "v1",
    auth: oauth2Client,
  });

  const startHistoryId = account.lastHistoryId;
  if (!startHistoryId) {
    console.warn("[gmail] Missing lastHistoryId, falling back to full sync", {
      emailAddress,
    });
    await syncUserEmails(account.userId);
    await EmailAccount.updateOne(
      { _id: account._id },
      { lastHistoryId: historyId }
    );
    return;
  }

  let historyResponse;
  try {
    const historyParams = {
      userId: "me",
      startHistoryId,
      historyTypes: ["messageAdded"],
    };

    if (Array.isArray(account.watchLabels) && account.watchLabels.length === 1) {
      historyParams.labelId = account.watchLabels[0];
    }

    historyResponse = await gmail.users.history.list(historyParams);
  } catch (error) {
    const status = error?.code || error?.response?.status;
    if (status === 404) {
      console.warn("[gmail] historyId too old, full sync", {
        emailAddress,
        historyId,
      });
      await syncUserEmails(account.userId);
      await EmailAccount.updateOne(
        { _id: account._id },
        { lastHistoryId: historyId }
      );
      return;
    }
    throw error;
  }

  const historyRecords = historyResponse?.data?.history || [];
  const messageIds = new Set();

  historyRecords.forEach((record) => {
    (record.messagesAdded || []).forEach((entry) => {
      if (entry?.message?.id) {
        messageIds.add(entry.message.id);
      }
    });
  });

  const latestHistoryId = historyResponse?.data?.historyId || historyId;
  console.log("[gmail] History records", {
    emailAddress,
    count: historyRecords.length,
    latestHistoryId,
  });

  if (messageIds.size === 0) {
    console.log("[gmail] No new messages", { emailAddress });
    await EmailAccount.updateOne(
      { _id: account._id },
      { lastHistoryId: latestHistoryId }
    );
    return;
  }

  const messageDetails = await Promise.all(
    [...messageIds].map((id) =>
      gmail.users.messages.get({
        userId: "me",
        id,
        format: "metadata",
        metadataHeaders: ["Subject", "From", "Date"],
      })
    )
  );

  for (const messageData of messageDetails) {
    const message = messageData?.data;
    if (!message) continue;

    const headers = message.payload?.headers || [];
    const subject = headers.find((h) => h.name === "Subject")?.value;
    const from = headers.find((h) => h.name === "From")?.value;
    const date = headers.find((h) => h.name === "Date")?.value;
    const internalDateMs = Number(message.internalDate);
    const receivedAt = Number.isFinite(internalDateMs)
      ? new Date(internalDateMs)
      : date
      ? new Date(date)
      : null;

    const result = await Email.updateOne(
      { userId: account.userId, account: account.email, threadId: message.threadId },
      {
        account: account.email,
        threadId: message.threadId,
        subject,
        from,
        date,
        receivedAt,
        snippet: message.snippet,
        userId: account.userId,
        lastSyncedAt: new Date(),
        syncSource: "incremental",
      },
      { upsert: true }
    );

    await publishSocketEvent(
      "email-added",
      {
        account: account.email,
        threadId: message.threadId,
        subject,
        from,
        date,
        receivedAt,
        snippet: message.snippet,
        isIncremental: true,
      },
      account.userId.toString()
    );
    console.log("[gmail] Upserted message", {
      emailAddress,
      threadId: message.threadId,
      upserted: result?.upsertedId ? true : false,
    });
  }

  await EmailAccount.updateOne(
    { _id: account._id },
    { lastHistoryId: latestHistoryId }
  );
  console.log("[gmail] Incremental sync complete", {
    emailAddress,
    latestHistoryId,
  });
};
