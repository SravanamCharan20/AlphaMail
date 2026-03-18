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
  }));

  await EmailEmbedding.insertMany(docs);
};
