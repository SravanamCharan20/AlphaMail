import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { enqueueIncrementalSync } from "../queues/incrementalSync.js";

dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env"),
});

const emailAddress = process.argv[2];
const historyId = process.argv[3] || String(Date.now());

if (!emailAddress) {
  console.error(
    "Usage: node scripts/simulate-pubsub-push.js <emailAddress> [historyId]"
  );
  process.exit(1);
}

await enqueueIncrementalSync({
  emailAddress,
  historyId,
  source: "push",
});

console.log("Enqueued incremental-sync", { emailAddress, historyId });
process.exit(0);
