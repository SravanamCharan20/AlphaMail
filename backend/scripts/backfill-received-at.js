import dotenv from "dotenv";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import Email from "../models/Email.js";

dotenv.config();

const backfillReceivedAt = async () => {
  await connectDB();

  const query = {
    $or: [{ receivedAt: { $exists: false } }, { receivedAt: null }],
  };

  const cursor = Email.find(query).cursor();
  let total = 0;
  let updated = 0;

  for await (const email of cursor) {
    total += 1;

    let receivedAt = null;

    if (email.date) {
      const parsed = new Date(email.date);
      if (!Number.isNaN(parsed.getTime())) {
        receivedAt = parsed;
      }
    }

    if (!receivedAt && email.createdAt) {
      receivedAt = email.createdAt;
    }

    if (!receivedAt) continue;

    email.receivedAt = receivedAt;
    await email.save();
    updated += 1;
  }

  console.log(`Backfilled receivedAt for ${updated}/${total} emails.`);
  await mongoose.disconnect();
};

backfillReceivedAt().catch(async (error) => {
  console.error("Backfill failed:", error);
  await mongoose.disconnect();
  process.exit(1);
});
