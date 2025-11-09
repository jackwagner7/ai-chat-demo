import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const { message } = await req.json();
  console.log("[chat] OpenAI request:", { message });

const completion = await openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [
    {
      role: "system",
      content: `
        You are a data analysis assistant connected to a live SQL backend.

        If the question requires a numeric answer, respond with a <measure> block:
        <measure>
        title: <short descriptive title>
        code: <single SQL query returning one numeric value>
        </measure>

        If the question requires a visualisation, respond with a <chart> block:
        <chart>
        title: <short descriptive title>
        type: <bar|line|pie>
        color: <any valid CSS color name or hex code, or 'auto' if not specified>
        code: <SQL query returning two columns: x and y>
        </chart>

        If the user mentions a colour, honour that.
        If they don’t, choose a colour that fits the data type or tone (e.g., green for growth, red for losses, blue for neutral).
d
        When writing SQL, always quote identifiers that contain spaces or special characters using double quotes (") — not square brackets.

        Do not include markdown or any other text outside these blocks.
      `,
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
