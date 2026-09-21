import { google } from "googleapis";

const authClient = new google.auth.OAuth2();

const normalizeAudience = (value = "") => String(value || "").trim().replace(/\/+$/, "");

/**
 * Production always requires a verified OIDC bearer token.
 * Local/ngrok push subscriptions often omit auth; allow that only when:
 * - NODE_ENV is not production, and
 * - PUBSUB_REQUIRE_AUTH is not "true"
 * Or when PUBSUB_ALLOW_UNAUTHENTICATED_PUSH=true.
 */
export const shouldRequirePubSubAuth = () => {
  if (process.env.PUBSUB_ALLOW_UNAUTHENTICATED_PUSH === "true") {
    return false;
  }
  if (process.env.PUBSUB_REQUIRE_AUTH === "true") {
    return true;
  }
  return process.env.NODE_ENV === "production";
};

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
  const acceptedAudiences = String(audience)
    .split(",")
    .map((value) => normalizeAudience(value))
    .filter(Boolean);

  let ticket = null;
  let lastError = null;
  for (const acceptedAudience of acceptedAudiences) {
    try {
      ticket = await authClient.verifyIdToken({
        idToken: token,
        audience: acceptedAudience,
      });
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!ticket) {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64").toString("utf-8")
    );
    const actualAudience = normalizeAudience(payload?.aud || "");
    throw new Error(
      `Wrong recipient, payload audience=${actualAudience || "unknown"} expected=${acceptedAudiences.join(" | ") || "none"}`
    );
  }

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
