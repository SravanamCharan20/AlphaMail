import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

const API_KEY_ENV_NAMES = [
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "GOOGLE_GENAI_API_KEY",
  "NEXT_PUBLIC_GEMINI_API_KEY",
];

const MODEL_ENV_NAMES = [
  "GEMINI_MODEL",
  "GOOGLE_GENAI_MODEL",
  "NEXT_PUBLIC_GEMINI_MODEL",
];

let geminiClient = null;

const readFirstEnv = (names, fallback = "") => {
  for (const name of names) {
    const value = String(process.env[name] || "").trim();
    if (value) return value;
  }
  return fallback;
};

export const getGeminiApiKey = () => readFirstEnv(API_KEY_ENV_NAMES);

export const getGeminiModel = () =>
  readFirstEnv(MODEL_ENV_NAMES, "gemini-2.5-flash");

export const getGeminiConfigStatus = () => ({
  apiKeyConfigured: Boolean(getGeminiApiKey()),
  apiKeyEnvNames: API_KEY_ENV_NAMES,
  model: getGeminiModel(),
});

export const getGeminiClient = () => {
  const apiKey = getGeminiApiKey();

  if (!apiKey) {
    const error = new Error(
      `Gemini API key is not configured. Set one of: ${API_KEY_ENV_NAMES.join(
        ", "
      )}`
    );
    error.code = "MISSING_GEMINI_API_KEY";
    throw error;
  }

  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey });
  }

  return geminiClient;
};
