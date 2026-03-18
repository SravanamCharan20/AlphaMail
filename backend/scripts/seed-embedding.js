import mongoose from "mongoose";
import dotenv from "dotenv";
import EmailEmbedding from "../models/EmailEmbedding.js";

dotenv.config({
  path:"../.env"
});

const MONGO_URL = process.env.MONGO_URL;

const makeDummyVector = (dim) =>
  Array.from({ length: dim }, (_, i) => (i % 2 === 0 ? 0.001 : -0.001));

const run = async () => {
  if (!MONGO_URL) {
    console.error("MONGO_URL is not set");
    process.exit(1);
  }

  await mongoose.connect(MONGO_URL);

  const doc = await EmailEmbedding.create({
    userId: new mongoose.Types.ObjectId(),
    account: "dummy@example.com",
    threadId: "thread_dummy",
    messageId: "msg_dummy",
    chunkIndex: 0,
    chunkText: "This is a dummy embedding record for index creation.",
    embedding: makeDummyVector(384),
    embeddingModel: "sentence-transformers/all-MiniLM-L6-v2",
    embeddingDim: 384,
    receivedAt: new Date(),
    subject: "Dummy Embedding",
    from: "dummy@example.com",
    labels: ["INBOX"],
  });

  console.log("Inserted dummy embedding:", doc._id.toString());
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
