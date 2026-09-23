import { generateText } from "ai";
import { requireHanokHQ } from "@/lib/hanok-ai-auth";

export const runtime = "nodejs";
export const maxDuration = 30;

const CATEGORIES = [
  "Maintenance",
  "Supplier / Stock",
  "IT / POS",
  "Marketing",
  "HR / Staff",
  "Finance",
  "Landlord / Centre",
  "Health & Safety",
  "Other",
];

const WAITING_FOR = [
  "Supplier",
  "Landlord",
  "Contractor",
  "Staff",
  "Centre Management",
  "Other",
];

function parseJson(text) {
  const cleaned = String(text || "")
    .trim()
    .replace(/^\`\`\`json\s*/i, "")
    .replace(/\`\`\`$/i, "")
    .trim();
  return JSON.parse(cleaned);
}

function normalizeResult(value, stores) {
  const x = value && typeof value === "object" ? value : {};
  return {
    intent: ["ticket", "query", "brief"].includes(x.intent) ? x.intent : "ticket",
    title: String(x.title || "").slice(0, 140),
    store: stores.includes(x.store) ? x.store : null,
    category: CATEGORIES.includes(x.category) ? x.category : "Other",
    priority: x.priority === "urgent" ? "urgent" : "normal",
    status: x.status === "waiting" ? "waiting" : "new",
    waiting_for: WAITING_FOR.includes(x.waiting_for) ? x.waiting_for : null,
    due_hint: x.due_hint || null,
    follow_up_hint: x.follow_up_hint || null,
    summary: String(x.summary || "").slice(0, 1200),
    next_action: String(x.next_action || "").slice(0, 500),
  };
}

export async function POST(request) {
  const auth = await requireHanokHQ(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const text = String(body.text || "").trim();
  if (!text) return Response.json({ error: "text is required" }, { status: 400 });
  if (text.length > 12000) return Response.json({ error: "Input too large" }, { status: 413 });

  const stores = Array.isArray(body.stores)
    ? body.stores.map(String).filter(Boolean).slice(0, 50)
    : [];

  const now = String(body.now || new Date().toISOString());

  const prompt = [
    "You are Hanok AI, an operations assistant for a multi-store restaurant group in Australia.",
    "Understand English, Chinese, and mixed-language notes.",
    "Turn the user's note into a practical operations interpretation.",
    "Never invent a store. store must be exactly one of the supplied store names or null.",
    "If the note says we are waiting for a landlord, centre, supplier, contractor or staff response, use status=waiting.",
    "Use urgent only for genuinely time-critical operational, safety, compliance, outage, or same-day issues.",
    "If timing is explicit or clearly relative to the supplied current time, return ISO-8601 datetimes.",
    "Return JSON only. No markdown.",
    "",
    "Current time: " + now,
    "Allowed stores: " + JSON.stringify(stores),
    "User input: " + text,
    "",
    "Return exactly these fields:",
    JSON.stringify({
      intent: "ticket|query|brief",
      title: "short action-oriented title",
      store: "exact allowed store name or null",
      category: CATEGORIES,
      priority: "normal|urgent",
      status: "new|waiting",
      waiting_for: WAITING_FOR.concat([null]),
      due_hint: "ISO datetime or null",
      follow_up_hint: "ISO datetime or null",
      summary: "concise interpretation",
      next_action: "single best next action",
    }),
  ].join("\n");

  try {
    const result = await generateText({
      model: "openai/gpt-5.4",
      prompt,
      providerOptions: {
        gateway: {
          user: auth.user.id,
          tags: ["app:hanok-hq", "feature:quick-capture"],
        },
      },
    });

    const parsed = normalizeResult(parseJson(result.text), stores);
    return Response.json({ ok: true, result: parsed, usage: result.usage });
  } catch (error) {
    console.error("Hanok AI analyze error", error);
    return Response.json({ error: "AI analysis failed" }, { status: 500 });
  }
}
