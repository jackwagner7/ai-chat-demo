"use client";
import type { Msg } from "@/types";

export default function ChatPanel({
  messages,
  input,
  setInput,
  onSend,
}: {
  messages: Msg[];
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
}) {
  return (
    <div className="absolute bottom-4 right-4 w-[420px] bg-white rounded-xl shadow-lg flex flex-col">
      <div className="flex-1 p-3 overflow-y-auto h-80">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`mb-2 ${m.role === "user" ? "text-blue-600" : "text-green-700"}`}
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
          onKeyDown={(e) => e.key === "Enter" && onSend()}
          placeholder="Ask about your data..."
        />
        <button onClick={onSend} className="bg-blue-600 text-white px-4 rounded">
          Send
        </button>
      </div>
    </div>
  );
}
