import { emailQueue } from "./emailQueue.js";

export const enqueueIncrementalSync = async ({
  emailAddress,
  historyId,
  source = "push",
}) => {
  const normalizedEmail = String(emailAddress || "").trim().toLowerCase();
  const normalizedHistoryId = String(historyId || "").trim();

  // Push notifications must not share one jobId — coalescing dropped live mail
  // while an earlier sync was still running. Poll jobs may share a stable id.
  const jobOptions =
    source === "poll"
      ? {
          jobId: `incremental-poll-${normalizedEmail}`,
          removeOnComplete: true,
          removeOnFail: true,
        }
      : {
          removeOnComplete: 50,
          removeOnFail: 50,
        };

  try {
    await emailQueue.add(
      "incremental-sync",
      {
        emailAddress: normalizedEmail,
        historyId: normalizedHistoryId,
        source,
      },
      jobOptions
    );
  } catch (error) {
    const message = error?.message || String(error);
    if (source === "poll" && /already exists|JobId/i.test(message)) {
      return;
    }
    throw error;
  }
};
