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
