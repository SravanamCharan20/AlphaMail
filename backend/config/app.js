import "dotenv/config";

const DEFAULT_CLIENT_ORIGIN = "http://localhost:3000";

export const getClientOrigin = () =>
  process.env.CLIENT_ORIGIN?.trim() || DEFAULT_CLIENT_ORIGIN;

export const isAllowedOrigin = (origin) => {
  if (!origin) return true;

  const isProd = process.env.NODE_ENV === "production";
  const allowedOrigin = getClientOrigin();

  if (origin === allowedOrigin) return true;

  if (!isProd) {
    return (
      origin.startsWith("http://localhost:") ||
      origin.startsWith("http://127.0.0.1:")
    );
  }

  return false;
};

export const buildClientUrl = (path) =>
  new URL(path, getClientOrigin()).toString();
