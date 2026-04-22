import "dotenv/config";

const DEFAULT_CLIENT_ORIGIN = "http://localhost:3000";

const normalizeOrigin = (value = "") => value.trim().replace(/\/+$/, "");

const getConfiguredOrigins = () => {
  const rawOrigins = process.env.CLIENT_ORIGIN?.trim() || DEFAULT_CLIENT_ORIGIN;
  return rawOrigins
    .split(",")
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean);
};

export const getClientOrigin = () => getConfiguredOrigins()[0] || DEFAULT_CLIENT_ORIGIN;

export const isAllowedOrigin = (origin) => {
  if (!origin) return true;

  const isProd = process.env.NODE_ENV === "production";
  const normalizedOrigin = normalizeOrigin(origin);
  const allowedOrigins = getConfiguredOrigins();

  if (allowedOrigins.includes(normalizedOrigin)) return true;

  if (!isProd) {
    return (
      normalizedOrigin.startsWith("http://localhost:") ||
      normalizedOrigin.startsWith("http://127.0.0.1:")
    );
  }

  return false;
};

export const buildClientUrl = (path) =>
  new URL(path, getClientOrigin()).toString();
