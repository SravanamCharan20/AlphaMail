import dotenv from "dotenv";
import { emailQueue } from "../queues/emailQueue.js";

dotenv.config();

const emailAddress = process.argv[2];
const historyId = process.argv[3] || String(Date.now());

if (!emailAddress) {
  console.error(
    "Usage: node scripts/simulate-pubsub-push.js <emailAddress> [historyId]"
  );
  process.exit(1);
}

await emailQueue.add("incremental-sync", {
  emailAddress,
  historyId,
});

console.log("Enqueued incremental-sync", { emailAddress, historyId });
process.exit(0);
