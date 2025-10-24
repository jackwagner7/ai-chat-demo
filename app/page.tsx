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

export default function Home() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [schema, setSchema] = useState<string>("");
  const [preview, setPreview] = useState<{ columns: string[]; rows: any[] }>({
    columns: [],
    rows: [],
  });
  const [insights, setInsights] = useState<
    { title: string; value: string; code: string }[]
  >([]);
  const [charts, setCharts] = useState<
    { title: string; type: string; data: any[]; code: string }[]
  >([]);

  // 📂 Handle CSV upload
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    const uploadRes = await fetch(
      `${process.env.NEXT_PUBLIC_DATA_ENGINE_API}/upload`,
      {
        method: "POST",
        body: formData,
      }
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

  // 💬 Send question to AI
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

    // detect <measure> block
    const measureRegex =
      /<measure>[\s\S]*?title:\s*(.+?)\s*code:\s*([\s\S]+?)<\/measure>/i;
    const mMatch = reply.match(measureRegex);

    // detect <chart> block
    const chartRegex =
      /<chart>[\s\S]*?title:\s*(.+?)\s*type:\s*(.+?)\s*code:\s*([\s\S]+?)<\/chart>/i;
    const cMatch = reply.match(chartRegex);

    if (mMatch) {
      const [, title, code] = mMatch;

      const queryRes = await fetch(
        `${process.env.NEXT_PUBLIC_DATA_ENGINE_API}/query`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sql: code }),
        }
      );

      const resultData = await queryRes.json();
      if (resultData.rows?.length) {
        const firstValue = Object.values(resultData.rows[0])[0];
        setInsights((i) => [
          ...i,
          {
            title: title.trim(),
            value: String(firstValue),
            code: code.trim(),
          },
        ]);
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: "✅ Created a calculation card for you.",
          },
        ]);
      } else if (resultData.error) {
        setMessages((m) => [
          ...m,
          { role: "system", content: `❌ SQL error: ${resultData.error}` },
        ]);
      }
    } else if (cMatch) {
      const [, title, type, code] = cMatch;

      const queryRes = await fetch(
        `${process.env.NEXT_PUBLIC_DATA_ENGINE_API}/query`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sql: code }),
        }
      );

      const resultData = await queryRes.json();
      if (resultData.rows?.length) {
        setCharts((c) => [
          ...c,
          {
            title: title.trim(),
            type: type.trim().toLowerCase(),
            data: resultData.rows,
            code: code.trim(),
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
      {/* 📏 Measure cards */}
      {insights.map((insight, idx) => (
        <Rnd
          key={idx}
          default={{
            x: window.innerWidth / 2 - 150,
            y: window.innerHeight / 2 - 100,
            width: 300,
            height: "auto",
          }}
          bounds="window"
          dragHandleClassName="drag-handle"
          enableResizing={{ bottomRight: true }}
          onDragStart={() => (document.body.style.userSelect = "none")}
          onDragStop={() => (document.body.style.userSelect = "auto")}
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

      {/* 📊 Chart cards */}
      {charts.map((chart, idx) => (
        <Rnd
          key={idx}
          default={{
            x: window.innerWidth / 2 - 200,
            y: window.innerHeight / 2 - 150,
            width: 400,
            height: 300,
          }}
          bounds="window"
          dragHandleClassName="drag-handle"
          enableResizing={{ bottomRight: true }}
          onDragStart={() => (document.body.style.userSelect = "none")}
          onDragStop={() => (document.body.style.userSelect = "auto")}
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
          <ResponsiveContainer width="100%" height={220}>
            {chart.type === "bar" && (
              <BarChart data={chart.data}>
                <XAxis dataKey={Object.keys(chart.data[0])[0]} />
                <YAxis />
                <Tooltip />
                <Bar
                  dataKey={Object.keys(chart.data[0])[1]}
                  fill="#3b82f6"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            )}
            {chart.type === "line" && (
              <LineChart data={chart.data}>
                <XAxis dataKey={Object.keys(chart.data[0])[0]} />
                <YAxis />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey={Object.keys(chart.data[0])[1]}
                  stroke="#10b981"
                  strokeWidth={2}
                />
              </LineChart>
            )}
            {chart.type === "pie" && (
              <PieChart>
                <Pie
                  data={chart.data}
                  dataKey={Object.keys(chart.data[0])[1]}
                  nameKey={Object.keys(chart.data[0])[0]}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  fill="#6366f1"
                  label
                >
                  {chart.data.map((_, i) => (
                    <Cell key={i} fill={["#6366f1", "#10b981", "#f59e0b"][i % 3]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
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

      {/* Upload & chat (unchanged) */}
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
                        <td
                          key={c}
                          className="border border-gray-200 px-2 py-1"
                        >
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
