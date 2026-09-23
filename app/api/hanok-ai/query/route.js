import { generateText } from "ai";
import { requireHanokHQ } from "@/lib/hanok-ai-auth";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request) {
  const auth = await requireHanokHQ(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const question = String(body.question || "").trim();
  const context = body.context;

  if (!question) return Response.json({ error: "question is required" }, { status: 400 });
  if (!context) return Response.json({ error: "context is required" }, { status: 400 });

  const prompt = [
    "You are Hanok AI, the private operations assistant for Hanok Group.",
    "Answer the owner's question using only the supplied operational context.",
    "Do not invent facts or infer unseen data.",
    "If the answer is not present in the context, say exactly what is missing.",
    "When useful, identify the next action.",
    "Keep the answer concise unless the question asks for detail.",
    "",
    "Question: " + question,
    "Operational context:",
    JSON.stringify(context),
  ].join("\n");

  try {
    const result = await generateText({
      model: "openai/gpt-5.4",
      prompt,
      providerOptions: {
        gateway: {
          user: auth.user.id,
          tags: ["app:hanok-hq", "feature:query"],
        },
      },
    });

    return Response.json({ ok: true, answer: result.text, usage: result.usage });
  } catch (error) {
    console.error("Hanok AI query error", error);
    return Response.json({ error: "AI query failed" }, { status: 500 });
  }
}
