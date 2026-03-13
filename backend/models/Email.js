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
    snippet: String,
  },
  { timestamps: true }
);

export default mongoose.model("Email", emailSchema);
