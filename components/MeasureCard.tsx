"use client";
import { Rnd } from "react-rnd";
import type { Measure } from "@/types";

export default function MeasureCard({ measure }: { measure: Measure }) {
  return (
    <Rnd
      default={{ x: 200, y: 150, width: 420, height: 320 }}
      bounds="window"
      dragHandleClassName="drag-handle"
      enableResizing={{ bottom: true, right: true, bottomRight: true }}
      onDragStart={() => { document.body.style.userSelect = "none"; }}
      onDragStop={() => { document.body.style.userSelect = "auto"; }}
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
        <h3 className="font-bold text-lg">{measure.title}</h3>
      </div>
      <p className="text-3xl font-semibold text-center mb-3 select-none">
        {measure.value}
      </p>
      <details className="bg-gray-100 rounded p-2 text-xs text-gray-700 select-text">
        <summary className="cursor-pointer font-medium">View SQL</summary>
        <pre className="overflow-x-auto whitespace-pre-wrap mt-2">
          {measure.code}
        </pre>
      </details>
    </Rnd>
  );
}
