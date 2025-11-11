export function randomColor() {
  const h = Math.floor(Math.random() * 360);
  return `hsl(${h}, 70%, 55%)`;
}

export function generatePalette(n: number, seed = 200) {
  const colors: string[] = [];
  for (let i = 0; i < n; i++) {
    const h = ((seed ?? 200) + i * (360 / n)) % 360;
    colors.push(`hsl(${h}, 70%, 55%)`);
  }
  return colors;
}

export function generateShade(baseColor: string, i: number, total: number) {
  try {
    const tmp = document.createElement("div");
    tmp.style.color = baseColor;
    document.body.appendChild(tmp);
    const rgb = getComputedStyle(tmp).color;
    document.body.removeChild(tmp);
    const [r, g, b] = rgb.match(/\d+/g)!.map(Number);
    const h =
      (Math.atan2(Math.sqrt(3) * (g - b), 2 * r - g - b) * 180) / Math.PI;
    const lightness = 45 + (i * 30) / total;
    return `hsl(${(h + i * 15) % 360}, 70%, ${lightness}%)`;
  } catch {
    return randomColor();
  }
}

export function normalizeType(raw: string, seriesCount: number) {
  const t = (raw || "").toLowerCase().replace(/\s|-|_/g, "");
  if (t.includes("stack")) return "stackedbar";
  if (t === "bar" && seriesCount > 1) return "stackedbar";
  return t;
}

export function deriveSeries(rows: Record<string, unknown>[], explicit?: string[]) {
  if (!rows?.length) return { xKey: "x", yKeys: [] };
  const keys = Object.keys(rows[0]);
  const xKey = keys[0];
  let yKeys = explicit && explicit.length ? explicit : keys.slice(1);
  yKeys = yKeys.filter((k) => typeof rows[0][k] === "number");
  return { xKey, yKeys };
}

type PreparedChartRows = {
  rows: Record<string, unknown>[];
  rawRows: Record<string, unknown>[];
  xKey: string;
  yKeys: string[];
  detectedSeriesKey?: string;
};

const stringifyValue = (value: unknown) =>
  value === null || value === undefined ? "" : String(value);

const pivotRows = (
  rows: Record<string, unknown>[],
  xKey: string,
  seriesKey: string,
  valueKey: string,
) => {
  const order: string[] = [];
  const pivotMap = new Map<string, { xValue: unknown; totals: Map<string, number> }>();
  const allSeries = new Set<string>();

  rows.forEach((row) => {
    const xVal = row[xKey];
    const xToken = stringifyValue(xVal);
    if (!pivotMap.has(xToken)) {
      order.push(xToken);
      pivotMap.set(xToken, { xValue: xVal, totals: new Map() });
    }
    const entry = pivotMap.get(xToken)!;
    const seriesVal = stringifyValue(row[seriesKey]);
    const numeric = Number(row[valueKey]);
    if (Number.isNaN(numeric)) return;
    const current = entry.totals.get(seriesVal) ?? 0;
    entry.totals.set(seriesVal, current + numeric);
    allSeries.add(seriesVal);
  });

  const normalizedRows: Record<string, unknown>[] = order.map((token) => {
    const entry = pivotMap.get(token)!;
    const row: Record<string, unknown> = { [xKey]: entry.xValue };
    entry.totals.forEach((value, series) => {
      row[series] = value;
    });
    return row;
  });

  return { rows: normalizedRows, yKeys: Array.from(allSeries) };
};

export function prepareChartRows(
  rows: Record<string, unknown>[],
  seriesKey?: string,
  explicitSeries?: string[],
): PreparedChartRows {
  if (!rows?.length) return { rows: [], rawRows: [], xKey: "x", yKeys: [] };
  const keys = Object.keys(rows[0]);
  const xKey = keys[0];

  const numericKeys = keys.filter(
    (key) => key !== xKey && typeof rows[0][key] === "number",
  );

  let effectiveSeriesKey = seriesKey;
  if (!effectiveSeriesKey) {
    const candidate = keys.find((key) => {
      if (key === xKey) return false;
      if (numericKeys.includes(key)) return false;
      const value = rows[0][key];
      return typeof value === "string";
    });
    if (candidate) {
      const distinct = new Set(rows.map((row) => stringifyValue(row[candidate])));
      if (distinct.size > 1) {
        effectiveSeriesKey = candidate;
      }
    }
  }

  if (effectiveSeriesKey && keys.includes(effectiveSeriesKey)) {
    const numericColumns = numericKeys.filter((key) => key !== effectiveSeriesKey);
    const valueKey = numericColumns[0];
    if (valueKey) {
      const { rows: normalizedRows, yKeys } = pivotRows(
        rows,
        xKey,
        effectiveSeriesKey,
        valueKey,
      );
      return {
        rows: normalizedRows,
        rawRows: rows,
        xKey,
        yKeys,
        detectedSeriesKey:
          effectiveSeriesKey !== seriesKey ? effectiveSeriesKey : undefined,
      };
    }
  }

  const derived = deriveSeries(rows, explicitSeries);
  return { rows, rawRows: rows, xKey: derived.xKey, yKeys: derived.yKeys };
}
