import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import IORedis from "ioredis";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const DEFAULT_REDIS_HOST = "127.0.0.1";
const DEFAULT_REDIS_PORT = 6379;

const getRedisPort = () => {
  const parsed = Number(process.env.REDIS_PORT || DEFAULT_REDIS_PORT);
  return Number.isFinite(parsed) ? parsed : DEFAULT_REDIS_PORT;
};

const getBaseRedisOptions = () => ({
  maxRetriesPerRequest: null,
});

export const createRedisConnection = () => {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (redisUrl) {
    return new IORedis(redisUrl, getBaseRedisOptions());
  }

  return new IORedis({
    host: process.env.REDIS_HOST || DEFAULT_REDIS_HOST,
    port: getRedisPort(),
    username: process.env.REDIS_USERNAME || undefined,
    password: process.env.REDIS_PASSWORD || undefined,
    ...getBaseRedisOptions(),
  });
};
