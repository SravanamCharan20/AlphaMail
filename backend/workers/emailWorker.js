import { Worker } from "bullmq";
import {
  syncIncrementalForAccount,
  syncUserEmails,
} from "../services/gmailService.js";
import { connectDB } from "../config/db.js";
import { publishSocketEvent } from "../services/socketPubSub.js";
import { createRedisConnection } from "../config/redis.js";
import { startIncrementalPoller } from "../services/incrementalPoller.js";

const redisConnection = createRedisConnection();

await connectDB();
console.log("Worker Started...");

startIncrementalPoller();

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
      console.log("[worker] Incremental job", {
        id: job.id,
        emailAddress: job.data?.emailAddress,
        historyId: job.data?.historyId,
        source: job.data?.source || "push",
      });
      await syncIncrementalForAccount(job.data);
      return;
    }

    console.log("Unknown job type:", job.name);
  },
  {
    connection: redisConnection,
    concurrency: 1,
  }
);

worker.on("completed", (job) => {
  console.log("Job completed:", job.id);
});

worker.on("failed", (job, err) => {
  console.log("Job failed:", job?.id, err);
});
