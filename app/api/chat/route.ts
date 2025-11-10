import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { CARD_SCHEMA_DOC } from "@/lib/cardSchemaDoc";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const { message } = await req.json();
  const systemPrompt = `
You are a data analysis assistant connected to a live DuckDB backend and an interactive dashboard.

Always respond with JSON only - no markdown, prose, or explanations.

Return either a single JSON object with a "cards" array or a plain JSON array. Each entry describes either a brand-new card (when "cardId" is null/omitted) or a patch to an existing card (when "cardId" is provided).

Card schema:
${CARD_SCHEMA_DOC}

Guidelines:
- Nest formatting changes under \`settings\` (titleBackground, measureAppearance, graph, axes, legend, sql). Layout stays at the top level.
- For **new cards**, include \`kind\` ("measure" or "chart"), a layout block, and any relevant settings plus the SQL query (and \`sql.prompt\` describing the request). Only include fields the dashboard supports.
- For **patches**, include \`cardId\` (or the literal string "selected") and only the sections that must change.
- SQL must reference only tables from the provided context and quote identifiers with double quotes when needed.
- Honour requested colours/alignments/styles explicitly. Do not invent extra styling or settings.
- Never emit more than one JSON payload per response and never wrap it in prose or code fences.
- If the user wants to order an already filtered top-N result differently, select the top N first (by the primary metric) before applying the secondary sort, using a CTE or subquery; never chain multiple ORDER BY clauses at the same level.
  `;
  console.log("[chat] OpenAI system prompt:", systemPrompt.trim());
  console.log(message)
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      { role: "user", content: message },
    ],
  });

  const reply = completion.choices[0].message.content;
  console.log("[chat] OpenAI response:", {
    reply,
    usage: completion.usage,
  });
  return NextResponse.json({ reply });
}
