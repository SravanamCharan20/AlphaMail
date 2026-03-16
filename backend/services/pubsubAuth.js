import { google } from "googleapis";

const authClient = new google.auth.OAuth2();

export const verifyPubSubJwt = async (
  authHeader,
  audience,
  expectedServiceAccount
) => {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Missing Authorization header");
  }

  if (!audience) {
    throw new Error("Missing Pub/Sub audience");
  }

  const token = authHeader.slice("Bearer ".length).trim();
  const ticket = await authClient.verifyIdToken({
    idToken: token,
    audience,
  });
  const payload = ticket.getPayload();

  if (!payload) {
    throw new Error("Invalid token payload");
  }

  if (expectedServiceAccount && payload.email !== expectedServiceAccount) {
    throw new Error("Unexpected service account");
  }

  if (payload.email_verified === false) {
    throw new Error("Service account email not verified");
  }

  return payload;
};
