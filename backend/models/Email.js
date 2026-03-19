import mongoose from "mongoose";

const emailSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    threadId: String,
    account: String,
    messageId: String,
    subject: String,
    from: String,
    to: String,
    date: String,
    receivedAt: Date,
    snippet: String,
    isUnread: {
      type: Boolean,
      default: false,
    },
    labels: [String],
    tags: [String],
    spamCategory: String,
    deadlineAt: Date,
    syncSource: {
      type: String,
      default: "initial",
    },
    lastSyncedAt: Date,
  },
  { timestamps: true }
);

emailSchema.index({ userId: 1, receivedAt: -1 });
emailSchema.index({ userId: 1, account: 1, receivedAt: -1 });
emailSchema.index({ userId: 1, threadId: 1 });
emailSchema.index({ userId: 1, isUnread: 1, receivedAt: -1 });
emailSchema.index({ userId: 1, tags: 1, receivedAt: -1 });

export default mongoose.model("Email", emailSchema);
