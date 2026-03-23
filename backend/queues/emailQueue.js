import { Queue } from "bullmq";
import { createRedisConnection } from "../config/redis.js";

const redisConnection = createRedisConnection();

export const emailQueue = new Queue("initial-sync", {
  connection: redisConnection,
});
