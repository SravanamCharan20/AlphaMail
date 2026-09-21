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

const TRIAGE_MODEL_ENV_NAMES = ["GEMINI_TRIAGE_MODEL"];

let geminiClient = null;

// Some Gemini API edges stall requests carrying the SDK's generated Node 25
// user-agent. Keep the SDK transport, but identify this server consistently.
const GEMINI_HTTP_HEADERS = {
  "user-agent": "AlphaMail/1.0",
  "x-goog-api-client": "AlphaMail/1.0",
};

const readFirstEnv = (names, fallback = "") => {
  for (const name of names) {
    const value = String(process.env[name] || "").trim();
    if (value) return value;
  }
  return fallback;
};

export const getGeminiApiKey = () => readFirstEnv(API_KEY_ENV_NAMES);

export const getGeminiModel = () =>
  readFirstEnv(MODEL_ENV_NAMES, "gemini-2.5-flash-lite");

// Triage is interactive, so its model is intentionally independent from a
// broader app default that may favor deeper reasoning over response time.
export const getGeminiTriageModel = () =>
  readFirstEnv(TRIAGE_MODEL_ENV_NAMES, "gemini-2.5-flash-lite");

export const getGeminiConfigStatus = () => ({
  apiKeyConfigured: Boolean(getGeminiApiKey()),
  apiKeyEnvNames: API_KEY_ENV_NAMES,
  model: getGeminiModel(),
  triageModel: getGeminiTriageModel(),
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
    geminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: GEMINI_HTTP_HEADERS },
    });
  }

  return geminiClient;
};
