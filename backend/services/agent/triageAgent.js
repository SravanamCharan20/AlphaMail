import {
  getGeminiClient,
  getGeminiConfigStatus,
  getGeminiTriageModel,
} from "./geminiClient.js";
import { triageTools } from "./toolRegistry.js";
import { toolHandlers } from "./toolHandlers.js";

// Each agent step is a network round trip. Three steps allow a tool request,
// a follow-up lookup, and a final answer without leaving the UI waiting on an
// unbounded chain of model calls.
const MAX_STEPS = 3;
const RETRYABLE_GEMINI_STATUSES = new Set([429, 500, 503]);
const RETRY_DELAY_MS = 1200;
// Fail over before the UI feels stalled. A healthy Flash request normally
// completes in a few seconds; the next fast model gets a chance at 8 seconds.
const GEMINI_STEP_TIMEOUT_MS = 8_000;
const TOOL_TIMEOUT_MS = 12_000;

const SYSTEM_PROMPT = `
You are AlphaMail, an inbox triage assistant.
Your job is to help the user decide what email work matters most right now.

Rules:
- Prefer using tools before answering if the user asks about inbox state, priorities, deadlines, replies, follow-ups, or specific threads.
- Ground every answer in tool results. Do not invent thread details.
- Prioritize unread threads, deadlines, follow-up requests, and emails that likely need replies.
- Keep answers concise, practical, and action-oriented.
- When useful, mention the account, subject, and why a thread matters.
- If there is not enough evidence, say so briefly.
`;

const buildUserPrompt = ({ query, account, range, selectedThread }) => {
  const contextLines = [
    `User request: ${query}`,
    `Active account filter: ${account || "all"}`,
    `Active date filter: ${range || "all"}`,
  ];

  if (selectedThread?.threadId && selectedThread?.account) {
    contextLines.push(
      `Currently selected thread: ${selectedThread.threadId} on ${selectedThread.account}`
    );
    if (selectedThread.subject) {
      contextLines.push(`Selected thread subject: ${selectedThread.subject}`);
    }
  }

  contextLines.push(
    "Use tools as needed, then answer with a compact triage summary and recommended next actions."
  );

  return contextLines.join("\n");
};

const buildToolConfig = () => ({
  tools: [
    {
      functionDeclarations: triageTools,
    },
  ],
  systemInstruction: SYSTEM_PROMPT,
  maxOutputTokens: 450,
  temperature: 0.2,
});

const executeToolCall = async ({ userId, toolCall }) => {
  const handler = toolHandlers[toolCall?.name];
  if (!handler) {
    throw new Error(`Unknown tool: ${toolCall?.name || "unknown"}`);
  }

  const args = toolCall?.args || {};
  const result = await handler({ userId, args });

  return {
    name: toolCall.name,
    id: toolCall.id,
    args,
    result,
  };
};

const withTimeout = async (promise, timeoutMs, label) => {
  let timeoutId;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`${label} timed out after ${timeoutMs / 1000}s`)),
          timeoutMs
        );
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getModelCandidates = () => {
  const triageModel = getGeminiTriageModel();
  return [...new Set([triageModel, "gemini-2.5-flash"])];
};

const isRetryableGeminiError = (error) =>
  RETRYABLE_GEMINI_STATUSES.has(Number(error?.status)) ||
  error?.name === "AbortError" ||
  /timeout|timed out|aborted/i.test(String(error?.message || ""));

const generateAgentStep = async ({ gemini, contents }) => {
  const modelCandidates = getModelCandidates();
  let lastError = null;

  for (const model of modelCandidates) {
    try {
      const config = buildToolConfig();
      // Triage is a retrieval-and-summary task. Disabling thinking on Gemini
      // 2.5 avoids spending extra latency on reasoning tokens before tools run.
      if (model.includes("flash")) {
        config.thinkingConfig = { thinkingBudget: 0 };
      }

      const response = await gemini.models.generateContent({
        model,
        contents,
        config: {
          ...config,
          abortSignal: AbortSignal.timeout(GEMINI_STEP_TIMEOUT_MS),
        },
      });

      return { response, model };
    } catch (error) {
      lastError = error;
      const shouldRetry =
        isRetryableGeminiError(error) &&
        model !== modelCandidates[modelCandidates.length - 1];

      if (shouldRetry) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }

      throw error;
    }
  }

  throw lastError || new Error("Gemini request failed");
};

export const runTriageAgent = async ({
  userId,
  query,
  account = "all",
  range = "all",
  selectedThread = null,
}) => {
  const gemini = getGeminiClient();

  const contents = [
    {
      role: "user",
      parts: [
        {
          text: buildUserPrompt({
            query,
            account,
            range,
            selectedThread,
          }),
        },
      ],
    },
  ];

  const toolCalls = [];
  let stepsUsed = 0;
  let finalAnswer = "";
  const startedAt = Date.now();

  while (stepsUsed < MAX_STEPS) {
    stepsUsed += 1;

    const { response } = await generateAgentStep({
      gemini,
      contents,
    });

    const requestedCalls = Array.isArray(response.functionCalls)
      ? response.functionCalls
      : [];

    if (!requestedCalls.length) {
      finalAnswer = response.text?.trim() || "";
      if (!finalAnswer && response.candidates?.[0]?.content) {
        finalAnswer = JSON.stringify(response.candidates[0].content);
      }
      break;
    }

    const modelContent = response.candidates?.[0]?.content;
    if (!modelContent) {
      throw new Error("Gemini returned tool calls without model content");
    }
    contents.push(modelContent);

    // Gemini may request independent lookups together. Running them serially
    // turns one model step into several slow database/Gmail operations.
    const executedCalls = await Promise.all(
      requestedCalls.map(async (requestedCall) => {
        try {
          return await withTimeout(
            executeToolCall({ userId, toolCall: requestedCall }),
            TOOL_TIMEOUT_MS,
            `Tool ${requestedCall?.name || "request"}`
          );
        } catch (error) {
          return {
            name: requestedCall?.name || "unknown",
            id: requestedCall?.id,
            args: requestedCall?.args || {},
            result: {
              error: error?.message || "Tool request failed",
            },
          };
        }
      })
    );

    executedCalls.forEach((executed) => {
      toolCalls.push({
        step: stepsUsed,
        name: executed.name,
        args: executed.args,
      });
    });

    // Function responses from the same model turn belong in one user message.
    contents.push({
      role: "user",
      parts: executedCalls.map((executed) => ({
        functionResponse: {
          name: executed.name,
          id: executed.id,
          response: { result: executed.result },
        },
      })),
    });
  }

  if (!finalAnswer) {
    finalAnswer =
      "I couldn't finish the triage cleanly. Please try refining the request.";
  }

  return {
    answer: finalAnswer,
    stepsUsed,
    toolCalls,
    durationMs: Date.now() - startedAt,
  };
};

export const getTriageAgentStatus = () => getGeminiConfigStatus();
