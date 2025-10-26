"use client";
import { Rnd } from "react-rnd";
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, Legend,
} from "recharts";
import { generateShade } from "@/lib/chartHelpers";
import type { Chart } from "@/types";

export default function ChartCard({ chart }: { chart: Chart }) {
  // determine x key
  const xKey = chart.xKey || Object.keys(chart.data[0])[0];

  // 🔹 sort the data by xKey
  const sortedData = [...chart.data].sort((a, b) => {
    const av = a[xKey];
    const bv = b[xKey];
    // numeric comparison if both numbers
    if (!isNaN(Number(av)) && !isNaN(Number(bv))) return Number(av) - Number(bv);
    // date comparison
    const ad = new Date(av);
    const bd = new Date(bv);
    if (!isNaN(ad.getTime()) && !isNaN(bd.getTime())) return ad.getTime() - bd.getTime();
    // fallback: string compare
    return String(av).localeCompare(String(bv));
  });

  return (
    <Rnd
      default={{ x: 250, y: 200, width: 420, height: 320 }}
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

      <ResponsiveContainer width="100%" height="100%">
        {/* --- Bar --- */}
        {chart.type === "bar" && (
          <BarChart data={sortedData} margin={{ top: 20, right: 20, left: 10, bottom: 30 }}>
            <XAxis dataKey={xKey} />
            <YAxis />
            <Tooltip />
            <Bar
              dataKey={chart.series[0] || Object.keys(chart.data[0])[1]}
              fill={chart.color}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        )}

        {/* --- Stacked bar --- */}
        {chart.type === "stackedbar" && (
          <BarChart data={sortedData} margin={{ top: 20, right: 20, left: 10, bottom: 30 }}>
            <XAxis dataKey={xKey} dy={10} />
            <YAxis />
            <Tooltip />
            <Legend verticalAlign="top" height={36} />
            {chart.series.map((s, i) => (
              <Bar key={s} dataKey={s} stackId="a" fill={chart.seriesColors[i]} />
            ))}
          </BarChart>
        )}

        {/* --- Multi-line chart --- */}
        {(chart.type === "line" || chart.type === "stackedline") && (
          <LineChart data={sortedData} margin={{ top: 20, right: 20, left: 10, bottom: 30 }}>
            <XAxis dataKey={xKey} />
            <YAxis />
            <Tooltip />
            <Legend verticalAlign="top" height={36} />
            {chart.series.map((s, i) => (
              <Line
                key={s}
                type="monotone"
                dataKey={s}
                stroke={chart.seriesColors[i]}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        )}

        {/* --- Pie --- */}
        {chart.type === "pie" && (
          <PieChart>
            <Pie
              data={sortedData}
              dataKey={chart.series[0] || Object.keys(chart.data[0])[1]}
              nameKey={xKey}
              cx="50%"
              cy="50%"
              outerRadius="80%"
              label
            >
              {sortedData.map((_, i) => {
                const sliceHue = (i * (360 / sortedData.length) + 20) % 360;
                const sliceColor =
                  chart.color === "auto"
                    ? `hsl(${sliceHue}, 70%, 55%)`
                    : generateShade(chart.color, i, sortedData.length);
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
        <pre className="overflow-x-auto whitespace-pre-wrap mt-2">{chart.code}</pre>
      </details>
    </Rnd>
  );
}
