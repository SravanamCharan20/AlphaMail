import { Worker } from "bullmq";
import {
  syncIncrementalForAccount,
  syncUserEmails,
} from "../services/gmailService.js";
import { connectDB } from "../config/db.js";
import { publishSocketEvent } from "../services/socketPubSub.js";
import { createRedisConnection } from "../config/redis.js";

const redisConnection = createRedisConnection();

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
      const result = await syncIncrementalForAccount(job.data);
      if (result?.userId) {
        await publishSocketEvent(
          "sync-complete",
          {
            userId: result.userId,
            incremental: true,
            account: result.account || null,
            changed: Boolean(result.changed),
          },
          result.userId
        );
      }
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
