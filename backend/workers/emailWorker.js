import { Worker } from "bullmq";
import IORedis from "ioredis";
import { syncUserEmails } from "../services/gmailService.js";
import { connectDB } from "../config/db.js";

const redisConnection = new IORedis({
    host: "127.0.0.1",
    port: 6379,
    maxRetriesPerRequest: null,
});

await connectDB();
console.log("Worker Started...");
const worker = new Worker(
  "initial-sync",
  async (job) => {
    const { userId } = job.data;
    await syncUserEmails(userId);
  },
  {
    connection: redisConnection,
  }
);

worker.on("completed", (job) => {
  console.log("Job completed:", job.id);
});

worker.on("failed", (job, err) => {
  console.log("Job failed:", err);
});
