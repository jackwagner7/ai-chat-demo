"use client";
import { useMemo, useRef, useEffect } from "react";
import type { RefObject } from "react";
import type { Card } from "@/types";
import { useTheme } from "@/context/ThemeContext";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Label,
  LabelList,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";

export default function CardView({
  card,
  onChange,
  isInteracting,
  onMeasureMinSize,
}: {
  card: Card;
  onChange: (next: Card) => void;
  isInteracting: boolean;
  onMeasureMinSize?: (size: { width: number; height: number }) => void;
}) {
  const { themeColors } = useTheme();
  const titleSpanRef = useRef<HTMLSpanElement | null>(null);

  const titleColor =
    card.settings.titleBackground.titleColorRef !== undefined
      ? themeColors[card.settings.titleBackground.titleColorRef]
      : card.settings.titleBackground.titleColor || "#111";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        className="drag-handle"
        style={{
          display: "flex",
          justifyContent:
            (card.settings.titleBackground.titleAlign || "center") === "left"
              ? "flex-start"
              : card.settings.titleBackground.titleAlign === "right"
              ? "flex-end"
              : "center",
          marginBottom: "0.5rem",
          cursor: isInteracting ? "grabbing" : "grab",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: `${card.settings.titleBackground.titleSize ?? 1.25}rem`,
            color: titleColor,
          }}
        >
          <span
            ref={titleSpanRef}
            style={{
              fontWeight: card.settings.titleBackground.titleBold ? 700 : 500,
              fontStyle: card.settings.titleBackground.titleItalic ? "italic" : "normal",
              textDecoration: card.settings.titleBackground.titleUnderline ? "underline" : "none",
            }}
          >
            {card.settings.titleBackground.title}
          </span>
        </h3>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        {card.kind === "measure" ? (
          <MeasureContent card={card} titleRef={titleSpanRef} onMeasureMinSize={onMeasureMinSize} />
        ) : (
          <ChartContent card={card} />
        )}
      </div>
    </div>
  );
}

function MeasureContent({
  card,
  titleRef,
  onMeasureMinSize,
}: {
  card: Extract<Card, { kind: "measure" }>;
  titleRef: RefObject<HTMLSpanElement | null>;
  onMeasureMinSize?: (size: { width: number; height: number }) => void;
}) {
  const { themeColors } = useTheme();
  const c = card.settings.measureAppearance;
  const color = c.colorRef !== undefined ? themeColors[c.colorRef] : c.color || "#111";
  const justify = c.measureAlignX === "left" ? "flex-start" : c.measureAlignX === "right" ? "flex-end" : "center";
  const align = c.measureAlignY === "top" ? "flex-start" : c.measureAlignY === "bottom" ? "flex-end" : "center";
  const valueRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!onMeasureMinSize) return;
    const titleBox = titleRef.current?.getBoundingClientRect();
    const valueBox = valueRef.current?.getBoundingClientRect();
    if (!titleBox || !valueBox) return;

    const contentWidth = Math.max(Math.round(titleBox.width), Math.round(valueBox.width));
    const contentHeight = Math.round(titleBox.height + valueBox.height);

    const fontScale = (card.settings.measureAppearance.fontSize ?? 3) / 3;
    const padX = 24 * fontScale;
    const padY = 32 * fontScale;

    const minWidth = Math.max(contentWidth + padX, 140);
    const minHeight = Math.max(contentHeight + padY, 50);

    onMeasureMinSize({ width: minWidth, height: minHeight });
  }, [
    onMeasureMinSize,
    titleRef,
    card.settings.titleBackground.title,
    card.settings.titleBackground.titleSize,
    card.settings.measureAppearance.fontSize,
    card.settings.measureAppearance.measureAlignX,
    card.settings.measureAppearance.measureAlignY,
    card.data.value,
  ]);

  return (
    <div style={{ display: "flex", height: "100%", justifyContent: justify, alignItems: align }}>
      <span
        ref={valueRef}
        style={{
          fontSize: `${c.fontSize ?? 3}rem`,
          color,
          userSelect: "none",
          WebkitUserSelect: "none",
          MozUserSelect: "none",
          msUserSelect: "none",
          pointerEvents: "none",
        }}
      >
        {String(card.data.value)}
      </span>
    </div>
  );
}

function ChartContent({ card }: { card: Extract<Card, { kind: "chart" }> }) {
  const { themeColors } = useTheme();
  const rawType = (card.settings.graph.chartType || "bar").toLowerCase();
  const barLayout = card.settings.graph.barLayout || (rawType === "stackedbar" ? "stacked" : "grouped");
  const normalizedType = rawType === "stackedbar" ? "bar" : rawType;
  const isLineLike = normalizedType === "line";
  const isPieLike = normalizedType === "pie";
  const isStackedBar = barLayout === "stacked" || rawType === "stackedbar";

  const rows = card.data.rows || [];
  const xKey = card.data.xKey || (rows[0] ? Object.keys(rows[0])[0] : undefined);
  const series = card.data.series || [];
  const legend = card.settings.legend || {};
  const displayNames = card.settings.legend.seriesDisplayNames || [];
  const axisTitleSize = card.settings.axes?.axisTitleSize ?? 1;
  const axisLabelSize = card.settings.axes?.labelSize ?? 0.9;
  const hasXAxisTitle = Boolean(card.settings.axes?.xLabel);
  const hasYAxisTitle = Boolean(card.settings.axes?.yLabel);
  const axisLabelGap = axisLabelSize * 16;
  const xAxisTitleDy = 12 + axisLabelGap;
  const yAxisTitleDx = -12 - axisLabelGap;
  const additionalBottomMargin = hasXAxisTitle ? Math.round(axisTitleSize * 32) : 0;
  const additionalLeftMargin = hasYAxisTitle ? Math.round(axisTitleSize * 32) : 0;
  const chartMargins = {
    top: 8,
    right: 16,
    bottom: 12 + additionalBottomMargin,
    left: 12 + additionalLeftMargin,
  };

  const seriesColors = useMemo(() => {
    return (legend.seriesColorRefs || []).map((r, i) =>
      r !== undefined ? themeColors[r] : legend.seriesColors?.[i]
    );
  }, [legend.seriesColorRefs, legend.seriesColors, themeColors]);
  const segmentColors = legend.segmentColors || {};
  const segmentColorRefs = legend.segmentColorRefs || {};

  if (!xKey || !rows.length || !series.length) {
    return <div style={{ opacity: 0.6, fontSize: "0.9rem" }}>No data</div>;
  }

  if (isPieLike) {
    const s = series[0];
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip />
          <Legend
            verticalAlign="top"
            align="center"
            layout="horizontal"
            wrapperStyle={{ fontSize: `${legend.legendSize ?? 0.9}rem`, lineHeight: "1.2em" }}
          />
          <Pie
            data={rows}
            dataKey={s}
            nameKey={xKey}
            outerRadius="80%"
            isAnimationActive={false}
          >
            {rows.map((row, i) => {
              const segmentKey = String(row?.[xKey] ?? "");
              const segmentRef = segmentColorRefs?.[segmentKey];
              const overrideColor =
                typeof segmentRef === "number"
                  ? themeColors[segmentRef]
                  : segmentColors?.[segmentKey];
              const fallbackColor =
                seriesColors?.[i % (seriesColors?.length || 1)] || "#8884d8";
              return <Cell key={i} fill={overrideColor ?? fallbackColor} />;
            })}
            <LabelList
              dataKey={xKey}
              position="outside"
              style={{ fill: "#111", fontWeight: 600 }}
            />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (isLineLike) {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={chartMargins}>
          <XAxis dataKey={xKey} tick={{ fontSize: (card.settings.axes.labelSize ?? 0.9) * 16, fill: card.settings.axes.labelColor }}>
            {card.settings.axes.xLabel ? (
              <Label
                value={card.settings.axes.xLabel}
                position="insideBottom"
                dy={xAxisTitleDy}
                style={{ fill: card.settings.axes.axisTitleColor, fontSize: `${card.settings.axes.axisTitleSize ?? 1}rem` }}
              />
            ) : null}
          </XAxis>
          <YAxis tick={{ fontSize: (card.settings.axes.labelSize ?? 0.9) * 16, fill: card.settings.axes.labelColor }}>
            {card.settings.axes.yLabel ? (
              <Label
                value={card.settings.axes.yLabel}
                angle={-90}
                position="insideLeft"
                dx={yAxisTitleDx}
                style={{ fill: card.settings.axes.axisTitleColor, fontSize: `${card.settings.axes.axisTitleSize ?? 1}rem` }}
              />
            ) : null}
          </YAxis>
          <Tooltip />
          <Legend
            verticalAlign="top"
            align="center"
            layout="horizontal"
            wrapperStyle={{ fontSize: `${legend.legendSize ?? 0.9}rem`, lineHeight: "1.2em" }}
          />
          {series.map((s, i) => (
            <Line
              key={s}
              type="monotone"
              dataKey={s}
              stroke={seriesColors?.[i] || "#8884d8"}
              strokeWidth={2}
              dot={false}
              name={displayNames[i]?.trim() ? displayNames[i] : s}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  // default: bar/stackedbar
  const isStacked = isStackedBar;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={chartMargins}>
        <XAxis dataKey={xKey} tick={{ fontSize: (card.settings.axes.labelSize ?? 0.9) * 16, fill: card.settings.axes.labelColor }}>
          {card.settings.axes.xLabel ? (
            <Label
              value={card.settings.axes.xLabel}
              position="insideBottom"
              dy={xAxisTitleDy}
              style={{ fill: card.settings.axes.axisTitleColor, fontSize: `${card.settings.axes.axisTitleSize ?? 1}rem` }}
            />
          ) : null}
        </XAxis>
        <YAxis tick={{ fontSize: (card.settings.axes.labelSize ?? 0.9) * 16, fill: card.settings.axes.labelColor }}>
          {card.settings.axes.yLabel ? (
            <Label
              value={card.settings.axes.yLabel}
              angle={-90}
              position="insideLeft"
              dx={yAxisTitleDx}
              style={{ fill: card.settings.axes.axisTitleColor, fontSize: `${card.settings.axes.axisTitleSize ?? 1}rem` }}
            />
          ) : null}
        </YAxis>
        <Tooltip />
        <Legend
          verticalAlign="top"
          align="center"
          layout="horizontal"
          wrapperStyle={{ fontSize: `${legend.legendSize ?? 0.9}rem`, lineHeight: "1.2em" }}
        />
        {series.map((s, i) => {
          const fill = seriesColors?.[i] || "#8884d8";
          return (
            <Bar
              key={s}
              dataKey={s}
              fill={fill}
              stackId={isStacked ? "a" : undefined}
              name={displayNames[i]?.trim() ? displayNames[i] : s}
            >
              {series.length === 1 && legend.segmentColorEnabled &&
                rows.map((row, idx) => {
                  const categoryKey = String(row?.[xKey] ?? "");
                  const segmentRef = segmentColorRefs?.[categoryKey];
                  const overrideColor =
                    (typeof segmentRef === "number"
                      ? themeColors[segmentRef]
                      : segmentColors?.[categoryKey]) || fill;
                  return <Cell key={`${categoryKey}-${idx}`} fill={overrideColor} />;
                })}
            </Bar>
          );
        })}
      </BarChart>
    </ResponsiveContainer>
  );
}
