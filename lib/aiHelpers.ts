import type {
  CardLayout,
  TitleBackgroundSettings,
  MeasureAppearanceSettings,
  GraphSettings,
  AxesSettings,
  LegendSettings,
  SqlSettings,
  CardKind,
} from "@/types";

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

type InstructionSettings = {
  titleBackground?: Partial<TitleBackgroundSettings>;
  measureAppearance?: Partial<MeasureAppearanceSettings>;
  graph?: Partial<GraphSettings>;
  axes?: Partial<AxesSettings>;
  legend?: Partial<LegendSettings>;
  sql?: Partial<SqlSettings>;
};

export type PatchBlock = {
  cardId?: string;
  cardTitle?: string;
  kind?: CardKind;
  series?: string[];
  layout?: Partial<CardLayout>;
  titleBackground?: Partial<TitleBackgroundSettings>;
  measureAppearance?: Partial<MeasureAppearanceSettings>;
  graph?: Partial<GraphSettings>;
  axes?: Partial<AxesSettings>;
  legend?: Partial<LegendSettings>;
  sql?: Partial<SqlSettings>;
  settings?: InstructionSettings;
};

export function extractPatchBlocks(reply: string): PatchBlock[] {
  const patches: PatchBlock[] = [];
  const re = /<patch>\s*([\s\S]*?)\s*<\/patch>/gi;
  let match: RegExpExecArray | null;

  while ((match = re.exec(reply)) !== null) {
    const raw = stripCodeFences(match[1] ?? "").trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        patches.push(normalizeInstruction(parsed as PatchBlock));
      }
    } catch {
      // ignore malformed JSON blocks
    }
  }

  return patches;
}

export function parseInstructionPayload(reply: string): PatchBlock[] | null {
  const cleaned = stripCodeFences(reply).trim();
  if (!cleaned) return null;
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed.map((entry) => normalizeInstruction(entry as PatchBlock));
    if (parsed && Array.isArray(parsed.cards)) {
      return parsed.cards.map((entry: unknown) => normalizeInstruction(entry as PatchBlock));
    }
    if (parsed && typeof parsed === "object") return [normalizeInstruction(parsed as PatchBlock)];
  } catch {
    // ignore parse errors
  }
  return null;
}

const mergeSections = <T extends Record<string, unknown>>(
  existing: T | undefined,
  incoming: T | undefined,
): T | undefined => {
  if (!existing && !incoming) return undefined;
  return { ...(incoming ?? {}), ...(existing ?? {}) } as T;
};

export function normalizeInstruction(block: PatchBlock): PatchBlock {
  const { settings, ...rest } = block;
  if (!settings) return rest;
  return {
    ...rest,
    titleBackground: mergeSections(rest.titleBackground, settings.titleBackground),
    measureAppearance: mergeSections(rest.measureAppearance, settings.measureAppearance),
    graph: mergeSections(rest.graph, settings.graph),
    axes: mergeSections(rest.axes, settings.axes),
    legend: mergeSections(rest.legend, settings.legend),
    sql: mergeSections(rest.sql, settings.sql),
  };
}
