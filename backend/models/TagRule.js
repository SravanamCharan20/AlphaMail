import mongoose from "mongoose";

const TagRuleSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    type: {
      type: String,
      enum: ["sender", "domain", "subject"],
      required: true,
      index: true,
    },
    value: { type: String, required: true, index: true },
    tags: { type: [String], default: [] },
    sourceThreadId: { type: String, default: null },
    sourceAccount: { type: String, default: null },
  },
  { timestamps: true }
);

TagRuleSchema.index({ userId: 1, type: 1, value: 1 }, { unique: true });

export default mongoose.model("TagRule", TagRuleSchema);
