import {
  getGeminiClient,
  getGeminiConfigStatus,
  getGeminiModel,
} from "./geminiClient.js";
import { triageTools } from "./toolRegistry.js";
import { toolHandlers } from "./toolHandlers.js";

const MAX_STEPS = 5;
const RETRYABLE_GEMINI_STATUSES = new Set([429, 500, 503]);
const RETRY_DELAY_MS = 1200;

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getModelCandidates = () => {
  const preferredModel = getGeminiModel();
  return [...new Set([preferredModel, "gemini-2.5-flash-lite"])];
};

const generateAgentStep = async ({ gemini, contents }) => {
  const modelCandidates = getModelCandidates();
  let lastError = null;

  for (const model of modelCandidates) {
    try {
      const response = await gemini.models.generateContent({
        model,
        contents,
        config: buildToolConfig(),
      });

      return { response, model };
    } catch (error) {
      lastError = error;
      const shouldRetry =
        RETRYABLE_GEMINI_STATUSES.has(Number(error?.status)) &&
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

    contents.push(response.candidates[0].content);

    for (const requestedCall of requestedCalls) {
      const executed = await executeToolCall({
        userId,
        toolCall: requestedCall,
      });

      toolCalls.push({
        step: stepsUsed,
        name: executed.name,
        args: executed.args,
      });

      contents.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              name: executed.name,
              id: executed.id,
              response: {
                result: executed.result,
              },
            },
          },
        ],
      });
    }
  }

  if (!finalAnswer) {
    finalAnswer =
      "I couldn't finish the triage cleanly. Please try refining the request.";
  }

  return {
    answer: finalAnswer,
    stepsUsed,
    toolCalls,
  };
};

export const getTriageAgentStatus = () => getGeminiConfigStatus();
