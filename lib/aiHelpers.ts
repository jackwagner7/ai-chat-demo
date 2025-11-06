export function stripCodeFences(s: string) {
  // Remove Markdown triple backtick fences first
  let out = s.replace(/```(?:sql)?\s*([\s\S]*?)```/gi, "$1").trim();

  // Remove surrounding triple quotes if present: """...""" or '''...'''
  if ((out.startsWith('"""') && out.endsWith('"""')) || (out.startsWith("'''") && out.endsWith("'''"))) {
    out = out.slice(3, -3).trim();
  }

  // Remove single pair of surrounding quotes if the entire block is quoted
  if ((out.startsWith('"') && out.endsWith('"')) || (out.startsWith("'") && out.endsWith("'"))) {
    out = out.slice(1, -1).trim();
  }

  return out;
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
