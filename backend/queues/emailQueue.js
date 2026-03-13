import { Queue } from "bullmq";
import IORedis from "ioredis";

const redisConnection = new IORedis({
  host: "127.0.0.1",
  port: 6379,
  maxRetriesPerRequest: null,
});

export const emailQueue = new Queue("initial-sync", {
  connection: redisConnection,
});
