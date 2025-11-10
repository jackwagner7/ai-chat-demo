export type DataRow = Record<string, unknown>;

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const toNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export const toStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((item) => String(item)) : [];

export const toRowsArray = (value: unknown, limit?: number): DataRow[] => {
  if (!Array.isArray(value)) return [];
  const source = typeof limit === "number" ? value.slice(0, limit) : value;
  return source.map((entry) => (isRecord(entry) ? entry : {}));
};

export const getRowsFromResult = (result: unknown): DataRow[] => {
  if (!isRecord(result)) return [];
  return toRowsArray(result["rows"]);
};

export const getErrorFromResult = (result: unknown): string | undefined =>
  isRecord(result) ? toNonEmptyString(result["error"]) : undefined;
