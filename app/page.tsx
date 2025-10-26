"use client";
import { useState } from "react";
import { extractBlock } from "@/lib/aiHelpers";
import { deriveSeries, normalizeType, randomColor, generatePalette } from "@/lib/chartHelpers";
import MeasureCard from "@/components/MeasureCard";
import ChartCard from "@/components/ChartCard";
import ChatPanel from "@/components/ChatPanel";
import CsvUploader from "@/components/CsvUploader";
import type { Msg, Measure, Chart } from "@/types";

export default function Home() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [schema, setSchema] = useState("");
  const [uploadedTables, setUploadedTables] = useState<{ name: string; columns: string[] }[]>([]);
  const [preview, setPreview] = useState<{ columns: string[]; rows: any[] }>({ columns: [], rows: [] });
  const [insights, setInsights] = useState<Measure[]>([]);
  const [charts, setCharts] = useState<Chart[]>([]);
  
  // ✅ when CSV is uploaded
  async function handleCsvUpload({ file, table, columns, previewRows }: any) {
    const summary = `Dataset: ${file.name}\nTable name: ${table}\nColumns: ${columns.join(", ")}`;
    setSchema((prev) => prev + "\n\n" + summary); // append schema info for all tables
    setUploadedTables((prev) => [...prev, { name: table, columns }]);
    setPreview({ columns, rows: previewRows });
    setMessages((m) => [...m, { role: "system", content: `Loaded dataset ${file.name} (${table})` }]);
  }


  // 💬 send message to AI
  async function sendMessage() {
    if (!input.trim()) return;
    const userMsg = { role: "user", content: input };
    setMessages((m) => [...m, userMsg]);
    setInput("");

    const tableList = uploadedTables
      .map((t) => `- "${t.name}" (${t.columns.join(", ")})`)
      .join("\n");

    const body =
      uploadedTables.length > 0
        ? {
            message: `
    You are an AI SQL assistant for DuckDB.

    📚 Available tables:
    ${tableList}

    ⚙️ Rules:
    - Only use the tables listed above.
    - NEVER invent table names.
    - Always quote column names with double quotes if needed.

    💬 User question:
    ${input}`,
          }
        : { message: input };



    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    const reply = data.reply || data.error;

    const mBlock = extractBlock(reply, "measure");
    const cBlock = extractBlock(reply, "chart");

    // ✅ Handle measure blocks
    if (mBlock) {
      const queryRes = await fetch(`${process.env.NEXT_PUBLIC_DATA_ENGINE_API}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: mBlock.code }),
      });
      const resultData = await queryRes.json();

      if (resultData.rows?.length) {
        const firstValue = Object.values(resultData.rows[0])[0];
        setInsights((i) => [...i, { title: mBlock.title, value: String(firstValue), code: mBlock.code }]);
        setMessages((m) => [...m, { role: "assistant", content: "✅ Created a calculation card for you." }]);
      } else if (resultData.error) {
        setMessages((m) => [...m, { role: "system", content: `❌ SQL error: ${resultData.error}` }]);
      }
      return;
    }

    // ✅ Handle chart blocks
    if (cBlock) {
      const queryRes = await fetch(`${process.env.NEXT_PUBLIC_DATA_ENGINE_API}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: cBlock.code }),
      });
      const resultData = await queryRes.json();

      if (resultData.rows?.length) {
        const { xKey, yKeys } = deriveSeries(resultData.rows, cBlock.series);
        const finalType = normalizeType(cBlock.type ?? "bar", yKeys.length);
        const resolvedColor = cBlock.color && cBlock.color !== "auto" ? cBlock.color : randomColor();
        const seriesColors = generatePalette(yKeys.length);

        setCharts((c) => [
          ...c,
          {
            title: cBlock.title,
            type: finalType,
            color: resolvedColor,
            series: yKeys,
            seriesColors,
            data: resultData.rows,
            code: cBlock.code,
            xKey,
          },
        ]);

        setMessages((m) => [...m, { role: "assistant", content: "📊 Created a chart for you." }]);
      } else if (resultData.error) {
        setMessages((m) => [...m, { role: "system", content: `❌ SQL error: ${resultData.error}` }]);
      }
      return;
    }

    // default text reply
    setMessages((m) => [...m, { role: "assistant", content: reply }]);
  }

  return (
    <main className="min-h-screen bg-black text-gray-900 relative">
      {insights.map((insight, i) => (
        <MeasureCard key={i} measure={insight} />
      ))}
      {charts.map((chart, i) => (
        <ChartCard key={i} chart={chart} />
      ))}

      {/* ✅ Pass handler down */}
      <CsvUploader onUpload={handleCsvUpload} />

      <ChatPanel messages={messages} input={input} setInput={setInput} onSend={sendMessage} />
    </main>
  );
}
