import EmailAccount from "../models/EmailAccount.js";
import { enqueueIncrementalSync } from "../queues/incrementalSync.js";

const DEFAULT_POLL_MS = 15_000;

/**
 * Local/ngrok Pub/Sub delivery is unreliable: Gmail can publish while the push
 * never reaches this process. Poll active watches so new mail still syncs live.
 */
export const startIncrementalPoller = () => {
  const enabled = process.env.INCREMENTAL_POLL_ENABLED !== "false";
  if (!enabled) {
    console.log("[poller] Incremental poller disabled");
    return null;
  }

  const intervalMs = Number(process.env.INCREMENTAL_POLL_MS || DEFAULT_POLL_MS);
  const pollEvery = Number.isFinite(intervalMs) && intervalMs >= 5000
    ? intervalMs
    : DEFAULT_POLL_MS;

  console.log("[poller] Starting incremental poller", { intervalMs: pollEvery });

  const tick = async () => {
    try {
      const accounts = await EmailAccount.find({
        lastHistoryId: { $exists: true, $nin: [null, ""] },
        refreshToken: { $exists: true, $nin: [null, ""] },
        $or: [
          { watchExpiration: { $gt: new Date() } },
          { updatedAt: { $gte: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) } },
        ],
      })
        .select("email lastHistoryId watchExpiration updatedAt")
        .sort({ updatedAt: -1 })
        .lean();

      const seen = new Set();
      for (const account of accounts) {
        const email = String(account.email || "").trim().toLowerCase();
        if (!email || seen.has(email)) continue;
        seen.add(email);

        await enqueueIncrementalSync({
          emailAddress: email,
          historyId: account.lastHistoryId,
          source: "poll",
        });
      }

      if (seen.size) {
        console.log("[poller] Enqueued incremental sync", {
          accounts: seen.size,
        });
      }
    } catch (error) {
      console.warn("[poller] Tick failed", error?.message || error);
    }
  };

  // First tick shortly after boot so reconnecting doesn't wait a full interval.
  const initial = setTimeout(tick, 3000);
  const timer = setInterval(tick, pollEvery);
  timer.unref?.();
  initial.unref?.();

  return () => {
    clearTimeout(initial);
    clearInterval(timer);
  };
};
