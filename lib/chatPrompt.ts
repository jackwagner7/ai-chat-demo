import type { Card, UploadedTableInfo } from "@/types";

const truncateMultiline = (value: string | undefined, limit = 600) => {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, limit)}…`;
};

export const estimateTokens = (text: string | undefined) => {
  if (!text) return 0;
  const trimmed = text.trim();
  if (!trimmed.length) return 0;
  return Math.ceil(trimmed.length / 4);
};

export const serializeCardForSchema = (card: Card) => {
  const summary: Record<string, unknown> = {
    cardId: card.id,
    kind: card.kind,
  };

  const title = card.settings.titleBackground.title?.trim();
  if (title) {
    summary.titleBackground = { title };
  }

  if (card.kind === "chart") {
    const graph: Record<string, string> = {};
    const chartType = card.settings.graph.chartType?.trim();
    if (chartType) graph.chartType = chartType;
    const barLayout = card.settings.graph.barLayout?.trim();
    if (barLayout) graph.barLayout = barLayout;
    if (Object.keys(graph).length) {
      summary.graph = graph;
    }

    const axes: Record<string, string> = {};
    const xLabel = card.settings.axes.xLabel?.trim();
    const yLabel = card.settings.axes.yLabel?.trim();
    if (xLabel) axes.xLabel = xLabel;
    if (yLabel) axes.yLabel = yLabel;
    if (Object.keys(axes).length) {
      summary.axes = axes;
    }
  }

  const sql: Record<string, string> = {};
  const sqlCode = card.settings.sql.code?.trim();
  const sqlPrompt = card.settings.sql.prompt?.trim();
  if (sqlCode) sql.code = truncateMultiline(sqlCode, 800);
  if (sqlPrompt) sql.prompt = truncateMultiline(sqlPrompt, 400);
  if (Object.keys(sql).length) summary.sql = sql;

  return summary;
};

export const buildExistingCardsSection = (
  cards: Card[],
  selectedCardId: string | null,
  includeAllCards: boolean,
) => {
  const cardsForContext =
    includeAllCards || !selectedCardId
      ? cards
      : cards.filter((card) => card.id === selectedCardId);

  const payload = cardsForContext.map((card) => {
    const summary = serializeCardForSchema(card);
    if (card.id === selectedCardId) {
      (summary as Record<string, unknown>).selected = true;
    }
    return summary;
  });

  return payload.length ? `Existing cards:\n${JSON.stringify(payload, null, 2)}` : "";
};

export const buildTableSection = (uploadedTables: UploadedTableInfo[]) => {
  if (!uploadedTables.length) return "";
  const tableList = uploadedTables
    .map((t) => `- "${t.displayName}" (${t.columns.join(", ")})`)
    .join("\n");
  return `You are an AI SQL assistant for DuckDB.

Available tables:
${tableList}

Rules:
- Only use the tables listed above.
- NEVER invent table names.
- Always quote column names with double quotes if needed.`;
};

