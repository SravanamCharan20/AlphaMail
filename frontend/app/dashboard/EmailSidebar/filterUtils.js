export const getDateRangeBounds = (range) => {
  const now = new Date();
  const startOfDay = (date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const endOfDay = (date) =>
    new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      23,
      59,
      59,
      999
    );

  if (range === "today") {
    return { start: startOfDay(now), end: endOfDay(now) };
  }

  if (range === "yesterday") {
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    return { start: startOfDay(y), end: endOfDay(y) };
  }

  if (range === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    return { start: startOfDay(start), end: now };
  }

  if (range === "month") {
    const start = new Date(now);
    start.setDate(now.getDate() - 29);
    return { start: startOfDay(start), end: now };
  }

  return null;
};

export const matchesFilters = (email, filters) => {
  if (filters.account !== "all" && email?.account !== filters.account) {
    return false;
  }

  if (Array.isArray(filters.tags) && filters.tags.length > 0) {
    const emailTags = Array.isArray(email?.tags) ? email.tags : [];
    const hasTag = filters.tags.some((tag) => emailTags.includes(tag));
    if (!hasTag) return false;
  }

  if (filters.range === "all") return true;

  const candidate = email?.receivedAt || email?.date;
  const parsed = candidate ? new Date(candidate) : null;

  if (!parsed || Number.isNaN(parsed.getTime())) {
    return false;
  }

  const bounds = getDateRangeBounds(filters.range);
  if (!bounds) return true;

  return parsed >= bounds.start && parsed <= bounds.end;
};
