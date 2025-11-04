"use client";
import { useEffect, useRef, useState } from "react";
import type { Msg } from "@/types";
import styles from "./ChatPanel.module.css";

export default function ChatPanel({
  messages,
  input,
  setInput,
  onSend,
  hasDataset,
}: {
  messages: Msg[];
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  hasDataset: boolean;
}) {
  const [visibleMessage, setVisibleMessage] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatHistoryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messages.length > 0) {
      const latest = messages[messages.length - 1];
      if (latest.role === "assistant" || latest.role === "system") {
        setVisibleMessage(latest.content);
        const timer = setTimeout(() => setVisibleMessage(null), 3000);
        return () => clearTimeout(timer);
      }
    }
  }, [messages]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = ta.scrollHeight + "px";
    }
  }, [input]);

  useEffect(() => {
    const el = chatHistoryRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, expanded]);

  if (!hasDataset) return null;

  return (
    <div className={styles.wrapper}>
      {expanded && (
        <div ref={chatHistoryRef} className={styles.chatHistory}>
          {messages.map((m, i) => (
            <div
              key={i}
              className={`${styles.message} ${
                m.role === "user" ? styles.user : styles.assistant
              }`}
            >
              <b>{m.role}:</b> {m.content}
            </div>
          ))}
        </div>
      )}

      <div className={styles.inputRow}>
        <div
          className={`${styles.inputBox} ${expanded ? styles.flatTop : ""}`}
        >
          <textarea
            ref={textareaRef}
            placeholder="Ask about your data..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            className={styles.textarea}
            rows={1}
          />
          <button className={styles.sendBtn} onClick={onSend}>
            ➤
          </button>
        </div>

        <button
          className={`${styles.toggleBtn} ${expanded ? styles.active + " " + styles.flatTop : ""}`}
          onClick={() => setExpanded((e) => !e)}
        >
          💬
        </button>

        {visibleMessage && (
          <div className={styles.toast} key={visibleMessage}>
            {visibleMessage}
          </div>
        )}
      </div>
    </div>
  );
}
