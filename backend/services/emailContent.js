import sanitizeHtml from "sanitize-html";
import { htmlToText } from "html-to-text";
import he from "he";

const ALLOWED_TAGS = [
  "a",
  "abbr",
  "b",
  "blockquote",
  "br",
  "code",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "span",
  "strong",
  "table",
  "tbody",
  "tfoot",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
];

const ALLOWED_ATTRIBUTES = {
  a: ["href", "name", "target", "rel"],
  img: ["src", "srcset", "sizes", "alt", "title", "width", "height", "style"],
  table: [
    "width",
    "height",
    "align",
    "bgcolor",
    "border",
    "cellpadding",
    "cellspacing",
    "style",
  ],
  tr: ["align", "valign", "bgcolor", "style"],
  td: [
    "align",
    "valign",
    "bgcolor",
    "colspan",
    "rowspan",
    "width",
    "height",
    "style",
  ],
  th: [
    "align",
    "valign",
    "bgcolor",
    "colspan",
    "rowspan",
    "width",
    "height",
    "style",
  ],
  "*": ["style"],
};

const ALLOWED_STYLES = {
  "*": {
    color: [/^#(0-9a-fA-F){3,6}$/i, /^rgb\(/, /^rgba\(/],
    "background-color": [
      /^#(0-9a-fA-F){3,6}$/i,
      /^rgb\(/,
      /^rgba\(/,
      /^transparent$/,
    ],
    background: [
      /^#(0-9a-fA-F){3,6}$/i,
      /^rgb\(/,
      /^rgba\(/,
      /^transparent$/,
      /^none$/,
      /^url\((['"])?(https?:|data:image\/)[^'")]+(['"])?\)$/i,
    ],
    "background-image": [
      /^url\((['"])?(https?:|data:image\/)[^'")]+(['"])?\)$/i,
      /^none$/,
    ],
    "background-repeat": [
      /^repeat$/,
      /^repeat-x$/,
      /^repeat-y$/,
      /^no-repeat$/,
    ],
    "background-position": [
      /^(left|right|center|top|bottom|\d+%|\d+px)(\s+(left|right|center|top|bottom|\d+%|\d+px))?$/i,
    ],
    "background-size": [
      /^auto$/,
      /^cover$/,
      /^contain$/,
      /^\d+(\.\d+)?(px|%)$/,
    ],
    "font-weight": [/^\d{3}$/, /^bold$/, /^bolder$/],
    "font-style": [/^italic$/],
    "text-decoration": [/^underline$/, /^line-through$/, /^none$/],
    "text-align": [/^left$/, /^right$/, /^center$/, /^justify$/],
    "font-size": [/^\d+(\.\d+)?(px|em|rem|%)$/],
    "font-family": [/^[a-zA-Z0-9,\s"'\\-]+$/],
    "line-height": [/^\d+(\.\d+)?(px|em|rem|%)$/],
    padding: [
      /^\d+(\.\d+)?(px|em|rem|%)?( \d+(\.\d+)?(px|em|rem|%)?){0,3}$/,
    ],
    margin: [
      /^auto$/,
      /^\d+(\.\d+)?(px|em|rem|%)?( \d+(\.\d+)?(px|em|rem|%)?){0,3}$/,
    ],
    border: [
      /^(\d+(\.\d+)?px\s+)?(solid|dashed|dotted|double|none)?\s*(#[0-9a-fA-F]{3,6}|rgb\([^)]+\)|rgba\([^)]+\)|transparent)?$/i,
    ],
    "border-radius": [/^\d+(\.\d+)?(px|%)$/],
    width: [/^\d+(\.\d+)?(px|%)$/],
    height: [/^\d+(\.\d+)?(px|%)$/],
    "max-width": [/^\d+(\.\d+)?(px|%)$/],
    "min-width": [/^\d+(\.\d+)?(px|%)$/],
    display: [
      /^block$/,
      /^inline$/,
      /^inline-block$/,
      /^table$/,
      /^table-row$/,
      /^table-cell$/,
      /^none$/,
    ],
    "vertical-align": [/^top$/, /^middle$/, /^bottom$/, /^baseline$/],
  },
};

const BASE_SANITIZE_OPTIONS = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: ALLOWED_ATTRIBUTES,
  allowedSchemes: ["http", "https", "mailto", "data"],
  allowedSchemesByTag: {
    img: ["http", "https", "data"],
  },
  allowedStyles: ALLOWED_STYLES,
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", {
      rel: "noopener noreferrer",
      target: "_blank",
    }),
    img: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        loading: "lazy",
        referrerpolicy: "no-referrer",
      },
    }),
  },
};

const buildAllowedStyles = (stripImages) => {
  if (!stripImages) return ALLOWED_STYLES;
  const base = {
    ...ALLOWED_STYLES,
    "*": {
      ...ALLOWED_STYLES["*"],
    },
  };
  delete base["*"].background;
  delete base["*"]["background-image"];
  return base;
};

export const hydrateCidReferences = (html, inlineCidMap) => {
  if (!html) return "";
  if (!inlineCidMap || Object.keys(inlineCidMap).length === 0) {
    return html;
  }

  return html.replace(/cid:([^"'\\s)]+)/gi, (match, cid) => {
    const normalized = normalizeContentId(cid);
    const mapped = inlineCidMap[normalized];
    return mapped ? mapped : match;
  });
};

const addBaseTarget = (html) => {
  if (!html) return "";
  if (/<base[^>]*>/i.test(html)) return html;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (match) => `${match}<base target="_blank">`);
  }
  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/<body[^>]*>/i, (match) => `<head><base target="_blank"></head>${match}`);
  }
  return `<head><base target="_blank"></head>${html}`;
};

export const buildRawHtml = ({ html, inlineCidMap }) => {
  if (!html) return "";
  let hydrated = hydrateCidReferences(html, inlineCidMap);
  hydrated = hydrated.replace(/<script[\s\S]*?<\/script>/gi, "");
  hydrated = addBaseTarget(hydrated);

  const hasHtmlTag = /<html[^>]*>/i.test(hydrated);
  const hasBodyTag = /<body[^>]*>/i.test(hydrated);
  if (hasHtmlTag || hasBodyTag) {
    return hydrated;
  }

  return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{margin:0;}</style></head><body>${hydrated}</body></html>`;
};

export const decodeBase64Url = (value) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4;
  const padded =
    padding === 0 ? normalized : normalized + "=".repeat(4 - padding);
  return Buffer.from(padded, "base64").toString("utf8");
};

export const decodeBase64UrlToBuffer = (value) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4;
  const padded =
    padding === 0 ? normalized : normalized + "=".repeat(4 - padding);
  return Buffer.from(padded, "base64");
};

export const normalizeContentId = (value) =>
  value ? value.replace(/[<>]/g, "").trim() : "";

export const getHeaderValue = (headers, name) =>
  headers.find(
    (header) =>
      header.name?.toLowerCase?.() === name.toLowerCase()
  )?.value;

const collectParts = (payload, acc = []) => {
  if (!payload) return acc;
  acc.push(payload);
  if (Array.isArray(payload.parts)) {
    payload.parts.forEach((part) => collectParts(part, acc));
  }
  return acc;
};

export const extractMessageParts = (message) => {
  const payload = message?.payload;
  if (!payload) return [];
  return collectParts(payload, []);
};

export const extractMessageContent = (message) => {
  const parts = extractMessageParts(message);
  const htmlPart = parts.find(
    (part) => part.mimeType === "text/html" && part.body?.data
  );
  const textPart = parts.find(
    (part) => part.mimeType === "text/plain" && part.body?.data
  );

  const html = htmlPart?.body?.data
    ? decodeBase64Url(htmlPart.body.data)
    : "";
  const text = textPart?.body?.data
    ? decodeBase64Url(textPart.body.data)
    : "";

  const attachments = parts
    .filter((part) => part.body?.attachmentId || part.filename)
    .map((part) => {
      const headers = part.headers || [];
      const contentId = normalizeContentId(
        getHeaderValue(headers, "Content-ID")
      );
      const disposition = getHeaderValue(headers, "Content-Disposition") || "";
      const inline =
        /inline/i.test(disposition) || Boolean(contentId && contentId.length);

      return {
        attachmentId: part.body?.attachmentId,
        filename: part.filename || "attachment",
        mimeType: part.mimeType || "application/octet-stream",
        size: part.body?.size || 0,
        inline,
        contentId,
        data: part.body?.data || null,
      };
    });

  const inlineCidMap = attachments.reduce((acc, attachment) => {
    if (attachment.inline && attachment.contentId) {
      acc[attachment.contentId] = attachment.attachmentId;
    }
    return acc;
  }, {});

  return {
    html,
    text,
    attachments,
    inlineCidMap,
    hasImages: /<img/i.test(html) || attachments.some((a) => a.inline),
  };
};

export const buildSafeHtml = ({
  html,
  inlineCidMap,
  stripImages = false,
}) => {
  if (!html) return "";

  let hydrated = hydrateCidReferences(html, inlineCidMap);

  const sanitizeOptions = stripImages
    ? {
        ...BASE_SANITIZE_OPTIONS,
        allowedTags: ALLOWED_TAGS.filter((tag) => tag !== "img"),
        allowedStyles: buildAllowedStyles(true),
      }
    : BASE_SANITIZE_OPTIONS;

  return sanitizeHtml(hydrated, sanitizeOptions);
};

export const buildPlainText = ({ text, html }) => {
  if (text) return he.decode(text).trim();
  if (!html) return "";
  const converted = htmlToText(html, {
    wordwrap: false,
    selectors: [
      { selector: "img", format: "skip" },
      { selector: "a", options: { hideLinkHrefIfSameAsText: true } },
    ],
  });
  return he.decode(converted).trim();
};
