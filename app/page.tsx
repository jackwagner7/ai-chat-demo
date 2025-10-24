"use client";
import { useState } from "react";
import Papa from "papaparse";
import { Rnd } from "react-rnd";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

type Msg = { role: string; content: string };

function generatePalette(n: number, seed?: number) {
  const colors: string[] = [];
  for (let i = 0; i < n; i++) {
    const h = ((seed ?? 200) + i * (360 / n)) % 360;
    colors.push(`hsl(${h}, 70%, 55%)`);
  }
  return colors;
}
function generateShade(baseColor: string, i: number, total: number) {
  // take the base hue if it's an HSL, otherwise approximate
  try {
    const tmp = document.createElement("div");
    tmp.style.color = baseColor;
    document.body.appendChild(tmp);
    const rgb = getComputedStyle(tmp).color;
    document.body.removeChild(tmp);
    const [r, g, b] = rgb.match(/\d+/g)!.map(Number);
    const h = (Math.atan2(Math.sqrt(3) * (g - b), 2 * r - g - b) * 180) / Math.PI;
    const lightness = 45 + (i * 30) / total; // small gradient of brightness
    return `hsl(${(h + i * 15) % 360}, 70%, ${lightness}%)`;
  } catch {
    return randomColor();
  }
}


function normalizeType(raw: string, seriesCount: number) {
  const t = (raw || "").toLowerCase().replace(/\s|-|_/g, "");
  if (t.includes("stack")) return "stackedbar";
  // auto-upgrade to stacked if multiple y columns and user said "bar"
  if (t === "bar" && seriesCount > 1) return "stackedbar";
  return t; // "bar" | "line" | "pie" | (fallback)
}

function deriveSeries(rows: Record<string, unknown>[], explicit?: string[]) {
  if (!rows?.length) return { xKey: "x", yKeys: [] };
  const keys = Object.keys(rows[0]);
  const xKey = keys[0];
  let yKeys = explicit && explicit.length ? explicit : keys.slice(1);

  // keep only numeric columns to avoid stacking strings
  yKeys = yKeys.filter((k) => typeof rows[0][k] === "number");

  return { xKey, yKeys };
}


function stripCodeFences(s: string) {
  return s.replace(/```(?:sql)?\s*([\s\S]*?)```/gi, "$1").trim();
}

function randomColor() {
  const h = Math.floor(Math.random() * 360);
  return `hsl(${h}, 70%, 55%)`;
}

function extractBlock(reply: string, tag: "measure" | "chart") {
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

export default function Home() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [schema, setSchema] = useState("");
  const [preview, setPreview] = useState<{ columns: string[]; rows: any[] }>({
    columns: [],
    rows: [],
  });
  const [insights, setInsights] = useState<
    { title: string; value: string; code: string }[]
  >([]);
  const [charts, setCharts] = useState<
    {
      title: string;
      type: string;
      color: string;
      series: string[];
      seriesColors: string[];
      data: Record<string, unknown>[];   // ✅ no explicit any
      code: string;
      xKey?: string;
    }[]
  >([]);




  // 📂 CSV upload
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    const uploadRes = await fetch(
      `${process.env.NEXT_PUBLIC_DATA_ENGINE_API}/upload`,
      { method: "POST", body: formData }
    );
    const uploadData = await uploadRes.json();
    const tableName = uploadData.table;

    Papa.parse(file, {
      header: true,
      preview: 5,
      complete: (results) => {
        const columns = Object.keys(results.data[0] || {});
        const summary = `
Dataset: ${file.name}
Table name: ${tableName}
Columns: ${columns.join(", ")}
`;
        setSchema(summary);
        setMessages((m) => [
          ...m,
          { role: "system", content: `Loaded dataset ${file.name}` },
        ]);
        setPreview({ columns, rows: results.data.slice(0, 5) });
      },
    });
  }

  // 💬 Ask AI
  async function sendMessage() {
    if (!input.trim()) return;
    const userMsg = { role: "user", content: input };
    setMessages((m) => [...m, userMsg]);
    setInput("");

    const body = schema
      ? { message: `Schema:\n${schema}\n\nQuestion: ${input}` }
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

    if (mBlock) {
      const queryRes = await fetch(
        `${process.env.NEXT_PUBLIC_DATA_ENGINE_API}/query`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sql: mBlock.code }),
        }
      );
      const resultData = await queryRes.json();

      if (resultData.rows?.length) {
        const firstValue = Object.values(resultData.rows[0])[0];
        setInsights((i) => [
          ...i,
          {
            title: mBlock.title,
            value: String(firstValue),
            code: mBlock.code,
          },
        ]);
        setMessages((m) => [
          ...m,
          { role: "assistant", content: "✅ Created a calculation card for you." },
        ]);
      } else if (resultData.error) {
        setMessages((m) => [
          ...m,
          { role: "system", content: `❌ SQL error: ${resultData.error}` },
        ]);
      }
    } else if (cBlock) {
      const queryRes = await fetch(
        `${process.env.NEXT_PUBLIC_DATA_ENGINE_API}/query`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sql: cBlock.code }),
        }
      );
      const resultData = await queryRes.json();

      if (resultData.rows?.length) {
        const { xKey, yKeys } = deriveSeries(resultData.rows, cBlock.series);
        const finalType = normalizeType(cBlock.type ?? "bar", yKeys.length);

        // pick base color once
        const baseColor = cBlock.color === "auto" ? randomColor() : cBlock.color;

        // generate consistent series colors
        const seriesColors = generatePalette(yKeys.length);

        const resolvedColor: string = cBlock.color && cBlock.color !== "auto"
          ? cBlock.color
          : randomColor();

        setCharts((c) => [
          ...c,
          {
            title: cBlock.title,
            type: finalType,
            color: resolvedColor,          // ✅ always string
            series: yKeys,
            seriesColors,
            data: resultData.rows,
            code: cBlock.code,
            xKey,
          },
        ]);


        setMessages((m) => [
          ...m,
          { role: "assistant", content: "📊 Created a chart for you." },
        ]);
      } else if (resultData.error) {
        setMessages((m) => [
          ...m,
          { role: "system", content: `❌ SQL error: ${resultData.error}` },
        ]);
      }
    } else {
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    }
  }

  return (
    <main className="min-h-screen bg-black text-gray-900 relative">
      {/* 📏 Measures */}
      {insights.map((insight, idx) => (
        <Rnd
          key={idx}
          default={{
            x: window.innerWidth / 2 - 200,
            y: window.innerHeight / 2 - 150,
            width: 420,
            height: 320, // now controls vertical size
          }}
          bounds="window"
          dragHandleClassName="drag-handle"
          enableResizing={{ bottom: true, bottomRight: true, right: true }}          
          onDragStart={() => {
            document.body.style.userSelect = "none";
          }}
          onDragStop={() => {
            document.body.style.userSelect = "auto";
          }}
          style={{
            background: "white",
            borderRadius: "0.75rem",
            boxShadow: "0 4px 15px rgba(0,0,0,0.25)",
            padding: "1rem",
            position: "absolute",
            zIndex: 50,
          }}
        >
          <div className="drag-handle mb-2 cursor-move select-none">
            <h3 className="font-bold text-lg">{insight.title}</h3>
          </div>
          <p className="text-3xl font-semibold text-center mb-3 select-none">
            {insight.value}
          </p>
          <details className="bg-gray-100 rounded p-2 text-xs text-gray-700 select-text">
            <summary className="cursor-pointer font-medium">View SQL</summary>
            <pre className="overflow-x-auto whitespace-pre-wrap mt-2">
              {insight.code}
            </pre>
          </details>
        </Rnd>
      ))}

      {/* 📊 Charts */}
      {charts.map((chart, idx) => (
        <Rnd
          key={idx}
          default={{
            x: window.innerWidth / 2 - 200,
            y: window.innerHeight / 2 - 150,
            width: 420,
            height: 320,
          }}
          bounds="window"
          dragHandleClassName="drag-handle"
          enableResizing={{ bottomRight: true }}
          onDragStart={() => {
            document.body.style.userSelect = "none";
          }}
          onDragStop={() => {
            document.body.style.userSelect = "auto";
          }}
          style={{
            background: "white",
            borderRadius: "0.75rem",
            boxShadow: "0 4px 15px rgba(0,0,0,0.25)",
            padding: "1rem",
            position: "absolute",
            zIndex: 60,
          }}
        >
          <div className="drag-handle mb-2 cursor-move select-none">
            <h3 className="font-bold text-lg">{chart.title}</h3>
          </div>
          <ResponsiveContainer width="100%" height="100%">
            {chart.type === "bar" && (
              <BarChart data={chart.data}>
                <XAxis dataKey={chart.xKey || Object.keys(chart.data[0])[0]} />
                <YAxis />
                <Tooltip />
                <Bar
                  dataKey={chart.series[0] || Object.keys(chart.data[0])[1]}
                  fill={chart.color}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            )}


            {chart.type === "stackedbar" && (
              <BarChart
                data={chart.data}
                margin={{ top: 20, right: 20, left: 10, bottom: 30 }}
              >
                <XAxis dataKey={chart.xKey || Object.keys(chart.data[0])[0]} dy={10} />
                <YAxis />
                <Tooltip />
                <Legend verticalAlign="top" height={36} />
                {chart.series.map((s, i) => (
                  <Bar key={s} dataKey={s} stackId="a" fill={chart.seriesColors[i]} />
                ))}
              </BarChart>
            )}


            {chart.type === "line" && (
              <LineChart data={chart.data}>
                <XAxis dataKey={chart.xKey || Object.keys(chart.data[0])[0]} />
                <YAxis />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey={chart.series[0] || Object.keys(chart.data[0])[1]}
                  stroke={chart.color}
                  strokeWidth={2}
                />
              </LineChart>
            )}
            {chart.type === "pie" && (
            <PieChart>
                  <Pie
                    data={chart.data}
                    dataKey={chart.series[0] || Object.keys(chart.data[0])[1]}
                    nameKey={chart.xKey || Object.keys(chart.data[0])[0]}
                    cx="50%"
                    cy="50%"
                    outerRadius="80%"
                    label
                  >
                    {chart.data.map((_, i) => {
                      // evenly spaced hues or base-colour variations
                      const sliceHue = (i * (360 / chart.data.length) + 20) % 360;
                      const sliceColor =
                        chart.color === "auto"
                          ? `hsl(${sliceHue}, 70%, 55%)`
                          : generateShade(chart.color, i, chart.data.length);
                      return <Cell key={i} fill={sliceColor} />;
                    })}
                  </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" height={36} iconType="circle" />
              </PieChart>
            )}


          </ResponsiveContainer>

          <details className="bg-gray-100 rounded p-2 text-xs text-gray-700 select-text">
            <summary className="cursor-pointer font-medium">View SQL</summary>
            <pre className="overflow-x-auto whitespace-pre-wrap mt-2">
              {chart.code}
            </pre>
          </details>
        </Rnd>
      ))}

      {/* Upload + Chat */}
      <div className="absolute top-4 right-4 w-[420px] bg-white rounded-xl shadow-lg p-4">
        {!preview.rows.length ? (
          <div className="flex flex-col items-center justify-center text-center">
            <h2 className="font-semibold mb-2">Upload a CSV file</h2>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="cursor-pointer"
            />
          </div>
        ) : (
          <div>
            <h2 className="font-semibold mb-2">Data preview</h2>
            <div className="overflow-x-auto text-sm">
              <table className="border-collapse border border-gray-300 w-full">
                <thead>
                  <tr>
                    {preview.columns.map((c) => (
                      <th
                        key={c}
                        className="border border-gray-300 px-2 py-1 bg-gray-100 text-left"
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, i) => (
                    <tr key={i}>
                      {preview.columns.map((c) => (
                        <td key={c} className="border border-gray-200 px-2 py-1">
                          {row[c]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="absolute bottom-4 right-4 w-[420px] bg-white rounded-xl shadow-lg flex flex-col">
        <div className="flex-1 p-3 overflow-y-auto h-80">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`mb-2 ${
                m.role === "user" ? "text-blue-600" : "text-green-700"
              }`}
            >
              <b>{m.role}:</b> {m.content}
            </div>
          ))}
        </div>
        <div className="p-3 border-t flex gap-2">
          <input
            className="flex-1 border rounded p-2 text-sm"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Ask about your data..."
          />
          <button
            onClick={sendMessage}
            className="bg-blue-600 text-white px-4 rounded"
          >
            Send
          </button>
        </div>
      </div>
    </main>
  );
}
