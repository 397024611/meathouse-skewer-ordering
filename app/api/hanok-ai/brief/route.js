import { generateText } from "ai";
import { requireHanokHQ } from "@/lib/hanok-ai-auth";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request) {
  const auth = await requireHanokHQ(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const context = body.context;
  if (!context) return Response.json({ error: "context is required" }, { status: 400 });

  const prompt = [
    "You are Hanok AI, acting as an operations chief-of-staff for the owner of a restaurant group.",
    "Use only the supplied operational context.",
    "Prioritise urgent and overdue work, today's deadlines, waiting follow-ups, unassigned work, finance/procurement blockers, and project blockers.",
    "Do not invent facts, amounts, dates, stores, people or status.",
    "Be concise and action-oriented.",
    "Output plain text with these headings: PRIORITIES, FOLLOW-UPS, WATCHLIST.",
    "Keep the whole brief under 220 words.",
    "",
    JSON.stringify(context),
  ].join("\n");

  try {
    const result = await generateText({
      model: "openai/gpt-5.4",
      prompt,
      providerOptions: {
        gateway: {
          user: auth.user.id,
          tags: ["app:hanok-hq", "feature:brief"],
        },
      },
    });

    return Response.json({ ok: true, brief: result.text, usage: result.usage });
  } catch (error) {
    console.error("Hanok AI brief error", error);
    return Response.json({ error: "AI brief failed" }, { status: 500 });
  }
}
