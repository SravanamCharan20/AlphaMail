export const triageTools = [
    {
      name: "search_emails",
      description:
        "Search the user's synced email summaries using a semantic query and optional filters like account, date range, and tags. Use this when you need a list of potentially relevant threads.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Natural language search query such as 'deadline', 'need reply', or 'meeting follow up'. Can be empty if using only filters.",
          },
          account: {
            type: "string",
            description:
              "Optional connected email account address to restrict the search.",
          },
          range: {
            type: "string",
            enum: ["all", "today", "yesterday", "week", "month"],
            description: "Optional date range filter.",
          },
          limit: {
            type: "number",
            description:
              "Maximum number of results to return. Keep this small, usually between 3 and 10.",
          },
          tags: {
            type: "array",
            items: {
              type: "string",
              enum: ["needs_reply", "deadline", "follow_up", "spam"],
            },
            description:
              "Optional tag filters for urgency or classification.",
          },
        },
        required: [],
      },
    },
    {
      name: "get_tag_counts",
      description:
        "Get counts of important email categories like needs_reply, deadline, follow_up, and spam for the user's inbox, optionally filtered by account and date range.",
      parameters: {
        type: "object",
        properties: {
          account: {
            type: "string",
            description:
              "Optional connected email account address to restrict the count.",
          },
          range: {
            type: "string",
            enum: ["all", "today", "yesterday", "week", "month"],
            description: "Optional date range filter.",
          },
        },
        required: [],
      },
    },
    {
      name: "get_thread",
      description:
        "Fetch the full details of a specific email thread, including messages and cleaned content. Use this after search when you need deeper context before answering.",
      parameters: {
        type: "object",
        properties: {
          threadId: {
            type: "string",
            description: "The Gmail thread ID to inspect.",
          },
          account: {
            type: "string",
            description: "The connected account email address for that thread.",
          },
        },
        required: ["threadId", "account"],
      },
    },
  ];
  