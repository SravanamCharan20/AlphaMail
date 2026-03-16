import mongoose from "mongoose";

const emailSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    threadId: String,
    account: String,
    subject: String,
    from: String,
    date: String,
    receivedAt: Date,
    snippet: String,
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

export default mongoose.model("Email", emailSchema);
