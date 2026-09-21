import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const INDEX_NAME = "email_embeddings_vector";
const COLLECTION = "email_embeddings";

const INDEX_DEFINITION = {
  name: INDEX_NAME,
  definition: {
    mappings: {
      dynamic: false,
      fields: {
        embedding: {
          type: "knnVector",
          dimensions: 384,
          similarity: "cosine",
        },
        userId: { type: "objectId" },
        account: { type: "token" },
        receivedAt: { type: "date" },
        labels: { type: "token" },
        tags: { type: "token" },
      },
    },
  },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const run = async () => {
  const mongoUrl = process.env.MONGO_URL;
  if (!mongoUrl) {
    console.error("MONGO_URL is not set");
    process.exit(1);
  }

  await mongoose.connect(mongoUrl);
  const coll = mongoose.connection.db.collection(COLLECTION);

  const existing = await coll.aggregate([{ $listSearchIndexes: {} }]).toArray();
  const current = existing.find((idx) => idx.name === INDEX_NAME);

  if (current?.queryable) {
    console.log(`✅ Vector index "${INDEX_NAME}" is already READY`);
    await mongoose.disconnect();
    return;
  }

  if (current) {
    console.log(`Index "${INDEX_NAME}" exists but status=${current.status}. Waiting...`);
  } else {
    console.log(`Creating vector index "${INDEX_NAME}"...`);
    await coll.createSearchIndex(INDEX_DEFINITION);
  }

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const indexes = await coll.aggregate([{ $listSearchIndexes: {} }]).toArray();
    const idx = indexes.find((entry) => entry.name === INDEX_NAME);
    if (idx?.queryable) {
      console.log(`✅ Vector index "${INDEX_NAME}" is READY`);
      await mongoose.disconnect();
      return;
    }
    console.log(
      `...building (${attempt + 1}/60) status=${idx?.status || "unknown"}`
    );
    await sleep(5000);
  }

  console.error(
    `Vector index "${INDEX_NAME}" did not become queryable in time. Check Atlas UI.`
  );
  await mongoose.disconnect();
  process.exit(1);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
