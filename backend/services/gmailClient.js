import { google } from "googleapis";
import { createOAuth2Client } from "../routes/constants.js";

export const createGmailClient = (account) => {
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: account.accessToken,
    refresh_token: account.refreshToken,
  });

  return google.gmail({
    version: "v1",
    auth: oauth2Client,
  });
};
