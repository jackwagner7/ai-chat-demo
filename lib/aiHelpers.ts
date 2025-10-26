export function stripCodeFences(s: string) {
  return s.replace(/```(?:sql)?\s*([\s\S]*?)```/gi, "$1").trim();
}

export function extractBlock(reply: string, tag: "measure" | "chart") {
  const re =
    tag === "measure"
      ? /<measure>[\s\S]*?title:\s*(.+?)\s*code:\s*([\s\S]+?)<\/measure>/i
      : /<chart>[\s\S]*?title:\s*(.+?)\s*type:\s*([a-zA-Z]+)\s*color:\s*(.+?)\s*(?:series:\s*(.+?)\s*)?code:\s*([\s\S]+?)<\/chart>/i;

  const m = reply.match(re);
  if (!m) return null;

  if (tag === "measure") {
    const [, title, code] = m;
    return { title: title.trim(), code: stripCodeFences(code) };
  } else {
    const [, title, type, color, series, code] = m;
    return {
      title: title.trim(),
      type: (type || "").trim().toLowerCase(),
      color: (color || "auto").trim(),
      series: series ? series.split(",").map((s) => s.trim()) : [],
      code: stripCodeFences(code),
    };
  }
}
