"use client";
import { useState } from "react";
import { extractBlock } from "@/lib/aiHelpers";
import { deriveSeries, normalizeType, generatePalette } from "@/lib/chartHelpers";
import CardContainer from "@/components/Card/CardContainer";
import ChatPanel from "@/components/ChatPanel";
import CsvUploader from "@/components/CsvUploader";
import ThemeManager from "@/components/ThemeManager";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import type { Msg, Card } from "@/types";
import styles from "./page.module.css";

function HomeContent() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [schema, setSchema] = useState("");
  const [uploadedTables, setUploadedTables] = useState<{ name: string; columns: string[] }[]>([]);
  const [preview, setPreview] = useState<{ columns: string[]; rows: any[] }>({ columns: [], rows: [] });
  const [cards, setCards] = useState<Card[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  const { themeColors } = useTheme();
  const handleBackgroundClick = () => setSelectedCardId(null);

  const themeColorToken = (index: number, fallback: string) => {
    const color = themeColors[index];
    return {
      ref: color !== undefined ? index : undefined,
      color: color !== undefined ? undefined : fallback,
      value: color ?? fallback,
    };
  };

  const assignSeriesColors = (
    count: number,
    backgroundRef?: number,
    avoidColorValue?: string,
  ) => {
    const avoidColorNorm = avoidColorValue?.toLowerCase();
    const availableIndices = Array.from(
      { length: themeColors.length },
      (_, idx) => idx,
    ).filter((idx) => {
      const color = themeColors[idx];
      if (color === undefined) return false;
      if (idx === backgroundRef) return false;
      if (avoidColorNorm && color.toLowerCase() === avoidColorNorm) return false;
      return true;
    });
    const preferredOrder = [
      ...availableIndices.filter((idx) => idx === 1),
      ...availableIndices.filter((idx) => idx !== 1),
    ];
    const fallbackPalette = generatePalette(Math.max(count, 1));
    const refs: number[] = [];
    const colors: string[] = [];
    let ptr = 0;
    for (let i = 0; i < count; i += 1) {
      const candidate = preferredOrder[ptr];
      if (candidate !== undefined) {
        refs[i] = candidate;
        colors[i] = themeColors[candidate]!;
        ptr += 1;
      } else {
        colors[i] = fallbackPalette[i % fallbackPalette.length];
      }
    }
    return { refs, colors };
  };

  const assignSegmentColors = (categories: string[], avoidColors: string[]) => {
    const avoidSet = new Set(
      avoidColors
        .filter((color) => Boolean(color))
        .map((color) => color.toLowerCase()),
    );
    const refs: Record<string, number> = {};
    const colors: Record<string, string> = {};
    const candidates = themeColors
      .map((color, idx) => ({ color, idx }))
      .filter(
        ({ color }) =>
          color !== undefined && !avoidSet.has(color.toLowerCase()),
      );
    const fallbackPalette = generatePalette(Math.max(categories.length, 1));
    let themePtr = 0;
    let fallbackPtr = 0;
    categories.forEach((category) => {
      if (themePtr < candidates.length) {
        refs[category] = candidates[themePtr].idx;
        themePtr += 1;
      } else {
        let color = fallbackPalette[fallbackPtr % fallbackPalette.length];
        let guard = 0;
        while (
          avoidSet.has(color.toLowerCase()) &&
          guard < fallbackPalette.length
        ) {
          fallbackPtr += 1;
          color = fallbackPalette[fallbackPtr % fallbackPalette.length];
          guard += 1;
        }
        colors[category] = color;
        fallbackPtr += 1;
      }
    });
    return { refs, colors };
  };

  async function handleCsvUpload({ file, table, columns, previewRows }: any) {
    const summary = `Dataset: ${file.name}\nTable name: ${table}\nColumns: ${columns.join(", ")}`;
    setSchema((prev) => prev + "\n\n" + summary);
    setUploadedTables((prev) => [...prev, { name: table, columns }]);
    setPreview({ columns, rows: previewRows });
    setMessages((m) => [...m, { role: "system", content: `Loaded dataset ${file.name} (${table})` }]);
  }

  async function sendMessage() {
    if (!input.trim()) return;
    const userMsg = { role: "user", content: input };
    setMessages((m) => [...m, userMsg]);
    setInput("");

    const tableList = uploadedTables.map((t) => `- "${t.name}" (${t.columns.join(", ")})`).join("\n");
    const body = uploadedTables.length > 0
      ? { message: `You are an AI SQL assistant for DuckDB.\n\nAvailable tables:\n${tableList}\n\nRules:\n- Only use the tables listed above.\n- NEVER invent table names.\n- Always quote column names with double quotes if needed.\n\nUser question:\n${input}` }
      : { message: input };

    const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    const reply = data.reply || data.error;

    const mBlock = extractBlock(reply, "measure");
    const cBlock = extractBlock(reply, "chart");

    if (mBlock) {
      const queryRes = await fetch(`${process.env.NEXT_PUBLIC_DATA_ENGINE_API}/query`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sql: mBlock.code }) });
      const resultData = await queryRes.json();
      if (resultData.rows?.length) {
        const firstValue = Object.values(resultData.rows[0])[0];
        const titleTheme = themeColorToken(0, "#111111");
        const measureTheme = themeColorToken(1, "#0078d4");
        const backgroundTheme = themeColorToken(2, "#ffffff");

        const newCard: Card = {
          id: crypto.randomUUID(),
          kind: "measure",
          data: { value: String(firstValue) },
          settings: {
            titleBackground: {
              title: mBlock.title,
              titleSize: 1.25,
              titleAlign: "center",
              titleColorRef: titleTheme.ref,
              titleColor: titleTheme.color,
              bgColorRef: backgroundTheme.ref,
              bgColor: backgroundTheme.color,
              titleBold: false,
              titleItalic: false,
              titleUnderline: false,
            },
            measureAppearance: {
              fontSize: 3,
              measureAlignX: "center",
              measureAlignY: "center",
              colorRef: measureTheme.ref,
              color: measureTheme.color,
            },
            sql: { code: mBlock.code },
          },
        };
        setCards((prev) => [...prev, newCard]);
        setMessages((m) => [...m, { role: "assistant", content: "Created a calculation card for you." }]);
      } else if (resultData.error) {
        setMessages((m) => [...m, { role: "system", content: `SQL error: ${resultData.error}` }]);
      }
      return;
    }

    if (cBlock) {
      const queryRes = await fetch(`${process.env.NEXT_PUBLIC_DATA_ENGINE_API}/query`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sql: cBlock.code }) });
      const resultData = await queryRes.json();
      if (resultData.rows?.length) {
        const { xKey, yKeys } = deriveSeries(resultData.rows, cBlock.series);
        const finalType = normalizeType(cBlock.type ?? "bar", yKeys.length);
        const titleTheme = themeColorToken(0, "#111111");
        const backgroundTheme = themeColorToken(2, "#ffffff");
        const {
          refs: initialSeriesRefs,
          colors: initialSeriesColors,
        } = assignSeriesColors(yKeys.length, backgroundTheme.ref, backgroundTheme.value);
        const segmentCategories = xKey
          ? Array.from(new Set(resultData.rows.map((row: any) => String(row[xKey]))))
          : [];
        const segmentConfig =
          finalType === "pie"
            ? assignSegmentColors(
                segmentCategories,
                backgroundTheme.value ? [backgroundTheme.value] : [],
              )
            : { refs: {}, colors: {} };
        const newCard: Card = {
          id: crypto.randomUUID(),
          kind: "chart",
          data: { rows: resultData.rows, xKey, series: yKeys },
          settings: {
            titleBackground: {
              title: cBlock.title,
              titleSize: 1.25,
              titleAlign: "center",
              titleColorRef: titleTheme.ref,
              titleColor: titleTheme.color,
              bgColorRef: backgroundTheme.ref,
              bgColor: backgroundTheme.color,
              titleBold: false,
              titleItalic: false,
              titleUnderline: false,
            },
            graph: {
              chartType: finalType === "stackedbar" ? "bar" : finalType,
              barLayout: finalType === "stackedbar" ? "stacked" : "grouped",
            },
            axes: { axisTitleSize: 1, labelSize: 0.9 },
            legend: {
              legendSize: 0.9,
              seriesDisplayNames: yKeys.map(() => ""),
              seriesColors: initialSeriesColors,
              seriesColorRefs: initialSeriesRefs,
              segmentColorEnabled: finalType === "pie",
              segmentColorRefs: segmentConfig.refs,
              segmentColors: segmentConfig.colors,
            },
            sql: { code: cBlock.code },
          },
        };
        setCards((prev) => [...prev, newCard]);
        setMessages((m) => [...m, { role: "assistant", content: "Created a chart for you." }]);
      } else if (resultData.error) {
        setMessages((m) => [...m, { role: "system", content: `SQL error: ${resultData.error}` }]);
      }
      return;
    }

    setMessages((m) => [...m, { role: "assistant", content: reply }]);
  }

  return (
    <main className={styles.main} onClick={handleBackgroundClick}>
      {cards.map((card) => (
        <CardContainer
          key={card.id}
          card={card}
          selectedId={selectedCardId}
          setSelectedId={setSelectedCardId}
          onChange={(next) => setCards((prev) => prev.map((c) => (c.id === next.id ? next : c)))}
          onDelete={(id) => setCards((prev) => prev.filter((c) => c.id !== id))}
        />
      ))}

      <ThemeManager />
      <CsvUploader onUpload={handleCsvUpload} />
      <ChatPanel messages={messages} input={input} setInput={setInput} onSend={sendMessage} hasDataset={uploadedTables.length > 0} />
    </main>
  );
}

export default function Home() {
  return (
    <ThemeProvider>
      <HomeContent />
    </ThemeProvider>
  );
}
