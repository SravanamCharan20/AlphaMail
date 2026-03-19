import mongoose from "mongoose";

const emailEmbeddingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    account: { type: String, index: true },
    threadId: { type: String, index: true },
    messageId: { type: String, index: true },
    chunkIndex: { type: Number, default: 0 },
    chunkText: { type: String, required: true },
    embedding: { type: [Number], required: true },

    embeddingModel: {
      type: String,
      default: "sentence-transformers/all-MiniLM-L6-v2",
    },
    embeddingDim: { type: Number, default: 384 },

    receivedAt: { type: Date, index: true },
    subject: String,
    from: String,
    labels: [String],
    tags: [String],
    spamCategory: String,
    deadlineAt: Date,
  },
  { timestamps: true }
);

// Helpful secondary indexes
emailEmbeddingSchema.index({ userId: 1, account: 1, receivedAt: -1 });
emailEmbeddingSchema.index({ userId: 1, threadId: 1 });
emailEmbeddingSchema.index({ userId: 1, messageId: 1 });

export default mongoose.model(
  "EmailEmbedding",
  emailEmbeddingSchema,
  "email_embeddings"
);
