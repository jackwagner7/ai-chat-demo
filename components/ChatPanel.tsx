"use client";
import { useEffect, useRef, useState } from "react";
import type { Msg } from "@/types";
import styles from "./ChatPanel.module.css";

type ChatPanelProps = {
  messages: Msg[];
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  hasDataset: boolean;
  isSending: boolean;
  globalContextEnabled: boolean;
  tokenEstimate: number;
  onToggleGlobalContext: () => void;
};

export default function ChatPanel({
  messages,
  input,
  setInput,
  onSend,
  hasDataset,
  isSending,
  globalContextEnabled,
  tokenEstimate,
  onToggleGlobalContext,
}: ChatPanelProps) {
  const [visibleMessage, setVisibleMessage] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatHistoryRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (messages.length > 0) {
      const latest = messages[messages.length - 1];
      if (latest.role === "assistant" || latest.role === "system") {
        const rafId = requestAnimationFrame(() => {
          if (toastTimerRef.current) {
            clearTimeout(toastTimerRef.current);
            toastTimerRef.current = null;
          }
          setVisibleMessage(latest.content);
          toastTimerRef.current = setTimeout(() => {
            setVisibleMessage(null);
            toastTimerRef.current = null;
          }, 3000);
        });
        return () => {
          cancelAnimationFrame(rafId);
          if (toastTimerRef.current) {
            clearTimeout(toastTimerRef.current);
            toastTimerRef.current = null;
          }
        };
      }
    }
    return undefined;
  }, [messages]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = `${ta.scrollHeight}px`;
    }
  }, [input]);

  useEffect(() => {
    const el = chatHistoryRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, expanded]);

  if (!hasDataset) return null;

  return (
    <div className={styles.wrapper} onClick={(e) => e.stopPropagation()}>
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
        <div className={`${styles.inputBox} ${expanded ? styles.flatTop : ""}`}>
          <textarea
            ref={textareaRef}
            placeholder="Ask about your data..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!isSending) onSend();
              }
            }}
            className={styles.textarea}
            rows={1}
            disabled={isSending}
          />
          <button
            type="button"
            className={`${styles.sendBtn} ${isSending ? styles.sendBtnLoading : ""}`}
            onClick={onSend}
            disabled={isSending || !input.trim()}
            aria-label={isSending ? "Sending..." : "Send message"}
          >
            {isSending ? <span className={styles.spinner} /> : "✈️"}
          </button>
        </div>

        <button
          type="button"
          className={`${styles.toggleBtn} ${
            expanded ? `${styles.active} ${styles.flatTop}` : ""
          }`}
          onClick={() => setExpanded((state) => !state)}
        >
          ▾
        </button>

        {visibleMessage && (
          <div className={styles.toast} key={visibleMessage}>
            {visibleMessage}
          </div>
        )}
      </div>

      <div className={styles.statusRow}>
        <button
          type="button"
          className={`${styles.globalToggle} ${
            globalContextEnabled ? styles.globalToggleOn : styles.globalToggleOff
          }`}
          onClick={onToggleGlobalContext}
        >
          Global Context: {globalContextEnabled ? "On" : "Off"}
        </button>
        <div className={styles.tokenSummary}>
          Tokens used (approx): <strong>{tokenEstimate}</strong>
        </div>
      </div>
    </div>
  );
}
