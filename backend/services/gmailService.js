import EmailAccount from "../models/EmailAccount.js";
import Email from "../models/Email.js";
import { publishSocketEvent } from "./socketPubSub.js";
import { createGmailClient } from "./gmailClient.js";
import {
  indexGmailMessageEmbeddings,
  indexGmailMessagesEmbeddingsBatch,
} from "./embeddingIndexer.js";
import { classifyEmail } from "./classification/index.js";
import { applyTagRules } from "./tagRulesService.js";

const getHeaderValue = (headers, name) =>
  headers.find((header) => header.name === name)?.value;

const buildEmailPayloadFromMessage = (message, threadIdOverride) => {
  if (!message) return null;

  const headers = message.payload?.headers || [];
  const labelIds = message.labelIds || [];
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

  const classification = classifyEmail({
    subject,
    from,
    to,
    snippet: message.snippet,
    headers,
    labelIds,
    receivedAt,
  });

  return {
    messageId: message.id,
    threadId: threadIdOverride || message.threadId,
    subject,
    from,
    to,
    date,
    receivedAt,
    snippet: message.snippet,
    isUnread: labelIds.includes("UNREAD"),
    labels: labelIds,
    tags: classification.tags,
    spamCategory: classification.spamCategory,
    deadlineAt: classification.deadlineAt,
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

  const mergedTags = await applyTagRules({
    userId,
    from: emailPayload.from,
    subject: emailPayload.subject,
    tags: emailPayload.tags || [],
  });
  emailPayload.tags = mergedTags;

  const emailQuery = {
    userId,
    account: accountEmail,
    threadId: emailPayload.threadId,
  };
  const existingEmail = await Email.exists(emailQuery);
  const emailDoc = await Email.findOneAndUpdate(
    emailQuery,
    {
      account: accountEmail,
      threadId: emailPayload.threadId,
      subject: emailPayload.subject,
      from: emailPayload.from,
      to: emailPayload.to,
      date: emailPayload.date,
      receivedAt: emailPayload.receivedAt,
      snippet: emailPayload.snippet,
      messageId: emailPayload.messageId,
      isUnread: emailPayload.isUnread,
      labels: emailPayload.labels || [],
      tags: mergedTags,
      spamCategory: emailPayload.spamCategory || null,
      deadlineAt: emailPayload.deadlineAt || null,
      userId,
      syncSource,
      lastSyncedAt: new Date(),
    },
    { new: true, upsert: true, setDefaultsOnInsert: true, lean: true }
  );

  await publishSocketEvent(
    "email-added",
    {
      _id: emailDoc?._id,
      account: accountEmail,
      threadId: emailPayload.threadId,
      subject: emailPayload.subject,
      from: emailPayload.from,
      to: emailPayload.to,
      date: emailPayload.date,
      receivedAt: emailPayload.receivedAt,
      snippet: emailPayload.snippet,
      messageId: emailPayload.messageId,
      isUnread: emailPayload.isUnread,
      labels: emailPayload.labels || [],
      tags: mergedTags,
      spamCategory: emailPayload.spamCategory || null,
      deadlineAt: emailPayload.deadlineAt || null,
      syncSource,
      lastSyncedAt: emailDoc?.lastSyncedAt,
      createdAt: emailDoc?.createdAt,
      updatedAt: emailDoc?.updatedAt,
      isIncremental,
      isNewThread: !existingEmail,
    },
    userId.toString()
  );

  return emailDoc;
};

export const syncUserEmails = async (userId) => {
  try {
    const accounts = await EmailAccount.find({ userId }).select(
      "email accessToken refreshToken"
    );

    for (const account of accounts) {
      const gmail = createGmailClient(account);
      const embedEntries = [];

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
            format: "full",
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

        embedEntries.push({
          message,
          threadIdOverride: threadData.data.id,
          tags: emailPayload?.tags || [],
          spamCategory: emailPayload?.spamCategory || null,
          deadlineAt: emailPayload?.deadlineAt || null,
        });
      }

      if (embedEntries.length) {
        await publishSocketEvent(
          "embedding-start",
          {
            account: account.email,
            totalMessages: embedEntries.length,
          },
          userId.toString()
        );
      }

      indexGmailMessagesEmbeddingsBatch({
        userId,
        account: account.email,
        entries: embedEntries,
      })
        .then(async () => {
          if (!embedEntries.length) return;
          await publishSocketEvent(
            "embedding-complete",
            {
              account: account.email,
              totalMessages: embedEntries.length,
            },
            userId.toString()
          );
        })
        .catch(async (err) => {
        console.warn(
          "[embedding] Initial sync batch embed failed",
          err?.message || err
        );
        if (!embedEntries.length) return;
        await publishSocketEvent(
          "embedding-error",
          {
            account: account.email,
            totalMessages: embedEntries.length,
            error: err?.message || String(err),
          },
          userId.toString()
        );
      });
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
    ? process.env.PUBSUB_LABELS.split(",")
        .map((label) => label.trim())
        .filter(Boolean)
    : ["INBOX"];

  const gmail = createGmailClient(account);

  let response;
  try {
    response = await gmail.users.watch({
      userId: "me",
      requestBody: {
        topicName,
        labelIds,
      },
    });
  } catch (error) {
    const details =
      error?.response?.data?.error?.message ||
      error?.message ||
      "Unknown Gmail watch error";
    throw new Error(
      `Gmail watch failed for ${account.email}: ${details}. ` +
        "Verify PUBSUB_TOPIC, topic publish permission for " +
        "gmail-api-push@system.gserviceaccount.com, and that a push subscription exists."
    );
  }

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

export const refreshMailboxWatchForUser = async (userId, accountEmail = null) => {
  const query = { userId };
  if (accountEmail) {
    query.email = accountEmail;
  }

  const accounts = await EmailAccount.find(query).select(
    "_id email accessToken refreshToken watchExpiration watchTopic watchLabels"
  );

  const results = [];
  for (const account of accounts) {
    try {
      const watch = await watchMailboxForAccount(account);
      results.push({
        account: account.email,
        ok: true,
        historyId: watch?.historyId || null,
        expiration: watch?.expiration
          ? new Date(Number(watch.expiration)).toISOString()
          : null,
      });
    } catch (error) {
      results.push({
        account: account.email,
        ok: false,
        error: error?.message || String(error),
      });
    }
  }

  return {
    refreshed: results.length,
    results,
  };
};

const isWatchExpired = (account) => {
  if (!account?.watchExpiration) return true;
  return account.watchExpiration.getTime() <= Date.now();
};

const ensureMailboxWatch = async (account) => {
  if (!isWatchExpired(account)) return account;
  console.warn("[gmail] Watch expired or missing, renewing", {
    account: account.email,
    watchExpiration: account.watchExpiration,
  });
  try {
    await watchMailboxForAccount(account);
    return EmailAccount.findById(account._id);
  } catch (error) {
    console.warn("[gmail] Watch renewal failed, continuing with existing tokens", {
      account: account.email,
      error: error?.message || error,
    });
    return account;
  }
};

const syncIncrementalForSingleAccount = async (account, historyId) => {
  const emailAddress = account.email;
  const activeAccount = await ensureMailboxWatch(account);
  if (!activeAccount) {
    return { userId: account.userId?.toString(), account: emailAddress, changed: false };
  }

  const gmail = createGmailClient(activeAccount);

  const startHistoryId = activeAccount.lastHistoryId;
  if (!startHistoryId) {
    console.warn("[gmail] Missing lastHistoryId, falling back to full sync", {
      emailAddress,
    });
    await syncUserEmails(activeAccount.userId);
    await EmailAccount.updateOne(
      { _id: activeAccount._id },
      { lastHistoryId: historyId }
    );
    return {
      userId: activeAccount.userId?.toString(),
      account: activeAccount.email,
      changed: true,
    };
  }

  let historyResponse;
  const historyRecords = [];
  try {
    const historyParams = {
      userId: "me",
      startHistoryId,
      historyTypes: ["messageAdded", "labelAdded", "labelRemoved"],
    };

    if (
      Array.isArray(activeAccount.watchLabels) &&
      activeAccount.watchLabels.length === 1
    ) {
      historyParams.labelId = activeAccount.watchLabels[0];
    }

    // Gmail may notify before history is queryable. Retry empty pages briefly.
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      historyRecords.length = 0;
      let pageToken = undefined;
      do {
        historyResponse = await gmail.users.history.list({
          ...historyParams,
          pageToken,
        });
        const pageRecords = historyResponse?.data?.history || [];
        historyRecords.push(...pageRecords);
        pageToken = historyResponse?.data?.nextPageToken || undefined;
      } while (pageToken);

      if (historyRecords.length > 0) break;

      const notifiedHistoryId = String(historyId || "");
      const latestSeen = String(
        historyResponse?.data?.historyId || startHistoryId || ""
      );
      let shouldRetry = false;
      try {
        shouldRetry =
          Boolean(notifiedHistoryId) &&
          Boolean(startHistoryId) &&
          BigInt(notifiedHistoryId) > BigInt(startHistoryId);
      } catch {
        shouldRetry = notifiedHistoryId !== startHistoryId;
      }

      if (!shouldRetry || attempt === maxAttempts) break;

      console.log("[gmail] Empty history after notify — retrying", {
        emailAddress,
        attempt,
        startHistoryId,
        notifiedHistoryId,
        latestSeen,
      });
      await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
    }
  } catch (error) {
    const status = error?.code || error?.response?.status;
    if (status === 404) {
      console.warn("[gmail] historyId too old, full sync", {
        emailAddress,
        historyId,
      });
      await syncUserEmails(activeAccount.userId);
      await EmailAccount.updateOne(
        { _id: activeAccount._id },
        { lastHistoryId: historyId }
      );
      return {
        userId: activeAccount.userId?.toString(),
        account: activeAccount.email,
        changed: true,
      };
    }
    throw error;
  }

  const messageIds = new Set(); // newly added message ids from history
  const threadReadUpdates = new Map();

  historyRecords.forEach((record) => {
    (record.messagesAdded || []).forEach((entry) => {
      if (entry?.message?.id) {
        messageIds.add(entry.message.id);
      }
    });

    (record.labelsAdded || []).forEach((entry) => {
      if (
        entry?.message?.threadId &&
        Array.isArray(entry?.labelIds) &&
        entry.labelIds.includes("UNREAD")
      ) {
        threadReadUpdates.set(entry.message.threadId, true);
      }
    });

    (record.labelsRemoved || []).forEach((entry) => {
      if (
        entry?.message?.threadId &&
        Array.isArray(entry?.labelIds) &&
        entry.labelIds.includes("UNREAD")
      ) {
        threadReadUpdates.set(entry.message.threadId, false);
      }
    });
  });

  const latestHistoryId = historyResponse?.data?.historyId || historyId;
  console.log("[gmail] History records", {
    emailAddress,
    count: historyRecords.length,
    messageIds: messageIds.size,
    latestHistoryId,
  });

  if (messageIds.size === 0 && threadReadUpdates.size === 0) {
    console.log("[gmail] No new messages", { emailAddress });
    await EmailAccount.updateOne(
      { _id: activeAccount._id },
      { lastHistoryId: latestHistoryId }
    );
    return {
      userId: activeAccount.userId?.toString(),
      account: activeAccount.email,
      changed: false,
    };
  }

  const MESSAGE_FETCH_CONCURRENCY = 5;
  const ids = [...messageIds];
  const messageDetails = [];
  for (let i = 0; i < ids.length; i += MESSAGE_FETCH_CONCURRENCY) {
    const chunk = ids.slice(i, i + MESSAGE_FETCH_CONCURRENCY);
    const chunkResults = await Promise.all(
      chunk.map(async (id) => {
        try {
          return await gmail.users.messages.get({
            userId: "me",
            id,
            format: "full",
          });
        } catch (error) {
          console.warn("[gmail] Failed to fetch message", {
            emailAddress,
            messageId: id,
            error: error?.message || String(error),
          });
          return null;
        }
      })
    );
    messageDetails.push(...chunkResults.filter(Boolean));
  }

  for (const messageData of messageDetails) {
    const message = messageData?.data;
    if (!message) continue;

    const emailPayload = buildEmailPayloadFromMessage(message);

    const result = await upsertEmailAndPublish({
      userId: activeAccount.userId,
      accountEmail: activeAccount.email,
      emailPayload,
      syncSource: "incremental",
      isIncremental: true,
    });
    console.log("[gmail] Upserted message", {
      emailAddress,
      threadId: emailPayload?.threadId,
      emailId: result?._id,
    });

    indexGmailMessageEmbeddings({
      userId: activeAccount.userId,
      account: activeAccount.email,
      message,
      tags: emailPayload?.tags || [],
      spamCategory: emailPayload?.spamCategory || null,
      deadlineAt: emailPayload?.deadlineAt || null,
    }).catch((err) => {
      console.warn(
        "[embedding] Incremental embed failed",
        err?.message || err
      );
    });
  }

  for (const [threadId, isUnread] of threadReadUpdates.entries()) {
    await Email.updateOne(
      {
        userId: activeAccount.userId,
        account: activeAccount.email,
        threadId,
      },
      { isUnread }
    );
    await publishSocketEvent(
      "email-updated",
      {
        account: activeAccount.email,
        threadId,
        isUnread,
      },
      activeAccount.userId.toString()
    );
  }

  await EmailAccount.updateOne(
    { _id: activeAccount._id },
    { lastHistoryId: latestHistoryId }
  );
  console.log("[gmail] Incremental sync complete", {
    emailAddress,
    latestHistoryId,
  });
  return {
    userId: activeAccount.userId?.toString(),
    account: activeAccount.email,
    changed: true,
  };
};

export const syncIncrementalForAccount = async ({
  emailAddress,
  historyId,
}) => {
  const normalizedEmail = String(emailAddress || "").trim().toLowerCase();
  console.log("[gmail] Incremental sync start", {
    emailAddress: normalizedEmail,
    historyId,
  });

  // Case-insensitive match; same Gmail can be linked to multiple AlphaMail users.
  const accounts = await EmailAccount.find({
    email: {
      $regex: `^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
      $options: "i",
    },
  }).sort({ updatedAt: -1 });

  if (!accounts.length) {
    console.warn("[gmail] No account for email", normalizedEmail);
    return null;
  }

  const results = [];
  for (const account of accounts) {
    try {
      // Skip obviously dead connections (expired watch + stale update) to avoid
      // invalid_grant noise after re-connect on another user/session.
      const watchExpired =
        !account.watchExpiration ||
        account.watchExpiration.getTime() <= Date.now();
      const staleMs = Date.now() - new Date(account.updatedAt || 0).getTime();
      const isStaleDuplicate =
        watchExpired && staleMs > 7 * 24 * 60 * 60 * 1000;

      if (isStaleDuplicate) {
        console.warn("[gmail] Skipping stale account connection", {
          emailAddress: normalizedEmail,
          userId: account.userId?.toString(),
          watchExpiration: account.watchExpiration,
          updatedAt: account.updatedAt,
        });
        continue;
      }

      const result = await syncIncrementalForSingleAccount(account, historyId);
      if (!result) continue;
      results.push(result);
      if (result.userId && result.changed) {
        await publishSocketEvent(
          "sync-complete",
          {
            userId: result.userId,
            incremental: true,
            account: result.account || null,
            changed: true,
          },
          result.userId
        );
      }
    } catch (error) {
      console.error("[gmail] Incremental sync failed for account", {
        emailAddress: normalizedEmail,
        userId: account.userId?.toString(),
        error: error?.message || error,
      });
    }
  }

  if (!results.length) return null;

  const changed = results.some((result) => result.changed);
  const primary = results[0];
  return {
    ...primary,
    changed,
    syncedAccounts: results.length,
    results,
  };
};
