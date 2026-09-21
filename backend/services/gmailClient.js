import { google } from "googleapis";
import { createOAuth2Client } from "../routes/constants.js";
import EmailAccount from "../models/EmailAccount.js";

export const createGmailClient = (account) => {
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: account.accessToken,
    refresh_token: account.refreshToken,
  });

  // Persist refreshed tokens so later sync / watch calls don't keep expired access tokens.
  oauth2Client.on("tokens", async (tokens) => {
    try {
      const update = {};
      if (tokens.access_token) update.accessToken = tokens.access_token;
      if (tokens.refresh_token) update.refreshToken = tokens.refresh_token;
      if (tokens.expiry_date) update.tokenExpiry = new Date(tokens.expiry_date);
      if (!Object.keys(update).length || !account?._id) return;
      await EmailAccount.updateOne({ _id: account._id }, { $set: update });
    } catch (error) {
      console.warn(
        "[gmail] Failed to persist refreshed OAuth tokens",
        error?.message || error
      );
    }
  });

  return google.gmail({
    version: "v1",
    auth: oauth2Client,
  });
};
