export const normalizeText = (text = "") =>
    String(text)
      .replace(/\u200b|\u200c|\u200d|\ufeff/g, "")
      .replace(/\s+/g, " ")
      .trim();
  
  export const chunkTextByWords = (
    text,
    { maxWords = 220, overlap = 40 } = {}
  ) => {
    const cleaned = normalizeText(text);
    if (!cleaned) return [];
    const words = cleaned.split(" ");
    const chunks = [];
    let start = 0;
    let index = 0;
  
    while (start < words.length) {
      const end = Math.min(start + maxWords, words.length);
      const slice = words.slice(start, end).join(" ");
      if (slice.trim()) {
        chunks.push({ index, text: slice.trim() });
        index += 1;
      }
      if (end >= words.length) break;
      start = Math.max(end - overlap, start + 1);
    }
  
    return chunks;
  };
  