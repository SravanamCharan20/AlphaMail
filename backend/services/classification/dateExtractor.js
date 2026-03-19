import * as chrono from "chrono-node";

const normalize = (value) => String(value || "").toLowerCase();

export const extractDeadlineDate = (text, baseDate) => {
  if (!text) return null;
  const lower = normalize(text);
  const base = baseDate instanceof Date && !Number.isNaN(baseDate.getTime())
    ? baseDate
    : new Date();

  if (/\b(eod|end of day|end-of-day)\b/.test(lower)) {
    const d = new Date(base);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  if (/\b(today|tonight)\b/.test(lower)) {
    const d = new Date(base);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  if (/\b(tomorrow)\b/.test(lower)) {
    const d = new Date(base);
    d.setDate(d.getDate() + 1);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  const results = chrono.parse(text, base, { forwardDate: true });
  if (!results.length) return null;

  const result = results[0];
  const parsed = result?.date?.();
  if (!parsed || Number.isNaN(parsed.getTime())) return null;

  const hasHour = result.start?.isCertain?.("hour");
  if (!hasHour) {
    parsed.setHours(23, 59, 59, 999);
  }

  return parsed;
};
