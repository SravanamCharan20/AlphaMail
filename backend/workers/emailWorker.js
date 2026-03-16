import { Worker } from "bullmq";
import IORedis from "ioredis";
import {
  syncIncrementalForAccount,
  syncUserEmails,
} from "../services/gmailService.js";
import { connectDB } from "../config/db.js";
import { publishSocketEvent } from "../services/socketPubSub.js";

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
    if (job.name === "initial-sync-emails") {
      const { userId } = job.data;
      await publishSocketEvent("sync-start", { userId }, userId.toString());
      await syncUserEmails(userId);
      await publishSocketEvent("sync-complete", { userId }, userId.toString());
      return;
    }

    if (job.name === "incremental-sync") {
      await syncIncrementalForAccount(job.data);
      return;
    }

    console.log("Unknown job type:", job.name);
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
