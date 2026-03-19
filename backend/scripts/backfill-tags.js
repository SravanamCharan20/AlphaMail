import mongoose from "mongoose";
import dotenv from "dotenv";
import Email from "../models/Email.js";
import { classifyEmail } from "../services/classification/index.js";

dotenv.config();

const MONGO_URL = process.env.MONGO_URL;

const run = async () => {
  if (!MONGO_URL) {
    console.error("MONGO_URL is not set.");
    process.exit(1);
  }

  await mongoose.connect(MONGO_URL);
  console.log("DB Connected...");

  const cursor = Email.find({}).cursor();
  const batch = [];
  let processed = 0;
  let updated = 0;

  const flush = async () => {
    if (!batch.length) return;
    const result = await Email.bulkWrite(batch);
    updated += result.modifiedCount || 0;
    batch.length = 0;
  };

  for await (const email of cursor) {
    const classification = classifyEmail({
      subject: email.subject,
      from: email.from,
      to: email.to,
      snippet: email.snippet,
      headers: [],
      labelIds: Array.isArray(email.labels) ? email.labels : [],
      receivedAt: email.receivedAt,
    });

    batch.push({
      updateOne: {
        filter: { _id: email._id },
        update: {
          $set: {
            tags: classification.tags,
            spamCategory: classification.spamCategory,
            deadlineAt: classification.deadlineAt,
          },
        },
      },
    });

    processed += 1;
    if (batch.length >= 500) {
      await flush();
      console.log(`Processed ${processed}...`);
    }
  }

  await flush();
  console.log(`Done. Processed ${processed}, updated ${updated}.`);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error("Backfill failed", err);
  process.exit(1);
});
