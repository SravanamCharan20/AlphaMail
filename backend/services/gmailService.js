import { google } from "googleapis";
import EmailAccount from "../models/EmailAccount.js";
import Email from "../models/Email.js";
import { createOAuth2Client } from "../routes/constants.js";
import { publishSocketEvent } from "./socketPubSub.js";

const createGmailClient = (account) => {
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: account.accessToken,
    refresh_token: account.refreshToken,
  });

  return google.gmail({
    version: "v1",
    auth: oauth2Client,
  });
};

const getHeaderValue = (headers, name) =>
  headers.find((header) => header.name === name)?.value;

const buildEmailPayloadFromMessage = (message, threadIdOverride) => {
  if (!message) return null;

  const headers = message.payload?.headers || [];
  const subject = getHeaderValue(headers, "Subject");
  const from = getHeaderValue(headers, "From");
  const date = getHeaderValue(headers, "Date");
  const internalDateMs = Number(message.internalDate);
  const receivedAt = Number.isFinite(internalDateMs)
    ? new Date(internalDateMs)
    : date
    ? new Date(date)
    : null;

  return {
    threadId: threadIdOverride || message.threadId,
    subject,
    from,
    date,
    receivedAt,
    snippet: message.snippet,
  };
};

const upsertEmailAndPublish = async ({
  userId,
  accountEmail,
  emailPayload,
  syncSource,
  isIncremental,
}) => {
  if (!emailPayload?.threadId) return null;

  const result = await Email.updateOne(
    { userId, account: accountEmail, threadId: emailPayload.threadId },
    {
      account: accountEmail,
      threadId: emailPayload.threadId,
      subject: emailPayload.subject,
      from: emailPayload.from,
      date: emailPayload.date,
      receivedAt: emailPayload.receivedAt,
      snippet: emailPayload.snippet,
      userId,
      syncSource,
      lastSyncedAt: new Date(),
    },
    { upsert: true }
  );

  await publishSocketEvent(
    "email-added",
    {
      account: accountEmail,
      threadId: emailPayload.threadId,
      subject: emailPayload.subject,
      from: emailPayload.from,
      date: emailPayload.date,
      receivedAt: emailPayload.receivedAt,
      snippet: emailPayload.snippet,
      isIncremental,
    },
    userId.toString()
  );

  return result;
};


export const syncUserEmails = async (userId) => {
  try {
    const accounts = await EmailAccount.find({ userId }).select(
      "email accessToken refreshToken"
    );

    for (const account of accounts) {
      const gmail = createGmailClient(account);

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

        const emailPayload = buildEmailPayloadFromMessage(
          message,
          threadData.data.id
        );

        await upsertEmailAndPublish({
          userId,
          accountEmail: account.email,
          emailPayload,
          syncSource: "initial",
          isIncremental: false,
        });
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

  const gmail = createGmailClient(account);

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

  const gmail = createGmailClient(account);

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

    const emailPayload = buildEmailPayloadFromMessage(message);

    const result = await upsertEmailAndPublish({
      userId: account.userId,
      accountEmail: account.email,
      emailPayload,
      syncSource: "incremental",
      isIncremental: true,
    });
    console.log("[gmail] Upserted message", {
      emailAddress,
      threadId: emailPayload?.threadId,
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
