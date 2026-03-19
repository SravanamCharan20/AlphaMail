import EmailEmbedding from "../models/EmailEmbedding.js";
import { embedTexts } from "./embeddingService.js";
import {
  extractMessageContent,
  buildPlainText,
  getHeaderValue,
} from "./emailContent.js";
import { chunkTextByWords, normalizeText } from "./textChunker.js";

const MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2";
const MODEL_DIM = 384;

export const buildEmbeddingTextFromMessage = (message) => {
  const headers = message?.payload?.headers || [];
  const subject = getHeaderValue(headers, "Subject") || "";
  const from = getHeaderValue(headers, "From") || "";

  const { html, text } = extractMessageContent(message);
  const bodyText = buildPlainText({ text, html });

  return normalizeText(
    [subject, from, bodyText].filter(Boolean).join("\n")
  );
};

export const indexGmailMessageEmbeddings = async ({
  userId,
  account,
  message,
  threadIdOverride,
  tags = [],
  spamCategory = null,
  deadlineAt = null,
}) => {
  if (!message?.id || !userId || !account) return;

  const exists = await EmailEmbedding.exists({
    userId,
    account,
    messageId: message.id,
  });
  if (exists) return;

  const combinedText = buildEmbeddingTextFromMessage(message);
  if (!combinedText) return;

  const chunks = chunkTextByWords(combinedText, {
    maxWords: 220,
    overlap: 40,
  });
  if (!chunks.length) return;

  const vectors = await embedTexts(chunks.map((c) => c.text));
  if (!vectors.length) return;

  const headers = message.payload?.headers || [];
  const subject = getHeaderValue(headers, "Subject") || "";
  const from = getHeaderValue(headers, "From") || "";
  const receivedAt = message.internalDate
    ? new Date(Number(message.internalDate))
    : undefined;

  const labelIds = message.labelIds || [];

  const docs = chunks.map((chunk, idx) => ({
    userId,
    account,
    threadId: threadIdOverride || message.threadId,
    messageId: message.id,
    chunkIndex: chunk.index,
    chunkText: chunk.text,
    embedding: vectors[idx],
    embeddingModel: MODEL_NAME,
    embeddingDim: MODEL_DIM,
    receivedAt,
    subject,
    from,
    labels: labelIds,
    tags,
    spamCategory,
    deadlineAt,
  }));

  await EmailEmbedding.insertMany(docs);
};

export const indexGmailMessagesEmbeddingsBatch = async ({
  userId,
  account,
  entries = [],
  batchSize = 96,
}) => {
  if (!userId || !account || !Array.isArray(entries) || entries.length === 0) {
    return;
  }

  const messageIds = entries
    .map((entry) => entry?.message?.id)
    .filter(Boolean);

  if (!messageIds.length) return;

  const existing = await EmailEmbedding.find({
    userId,
    account,
    messageId: { $in: messageIds },
  })
    .select("messageId")
    .lean();

  const existingSet = new Set(
    existing.map((doc) => String(doc.messageId))
  );

  let batchTexts = [];
  let batchDocs = [];

  const flushBatch = async () => {
    if (batchTexts.length === 0) return;
    const vectors = await embedTexts(batchTexts);
    if (!vectors.length) {
      batchTexts = [];
      batchDocs = [];
      return;
    }
    const docsToInsert = batchDocs.map((doc, idx) => ({
      ...doc,
      embedding: vectors[idx],
      embeddingModel: MODEL_NAME,
      embeddingDim: MODEL_DIM,
    }));
    await EmailEmbedding.insertMany(docsToInsert);
    batchTexts = [];
    batchDocs = [];
  };

  for (const entry of entries) {
    const message = entry?.message;
    if (!message?.id) continue;
    if (existingSet.has(String(message.id))) continue;

    const combinedText = buildEmbeddingTextFromMessage(message);
    if (!combinedText) continue;

    const chunks = chunkTextByWords(combinedText, {
      maxWords: 220,
      overlap: 40,
    });
    if (!chunks.length) continue;

    const headers = message.payload?.headers || [];
    const subject = getHeaderValue(headers, "Subject") || "";
    const from = getHeaderValue(headers, "From") || "";
    const receivedAt = message.internalDate
      ? new Date(Number(message.internalDate))
      : undefined;

    const labelIds = message.labelIds || [];

    for (const chunk of chunks) {
      batchTexts.push(chunk.text);
      batchDocs.push({
        userId,
        account,
        threadId: entry.threadIdOverride || message.threadId,
        messageId: message.id,
        chunkIndex: chunk.index,
        chunkText: chunk.text,
        receivedAt,
        subject,
        from,
        labels: labelIds,
        tags: Array.isArray(entry.tags) ? entry.tags : [],
        spamCategory: entry.spamCategory || null,
        deadlineAt: entry.deadlineAt || null,
      });

      if (batchTexts.length >= batchSize) {
        await flushBatch();
      }
    }
  }

  await flushBatch();
};
