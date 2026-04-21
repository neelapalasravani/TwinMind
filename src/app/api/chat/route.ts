import {
  GROQ_API_BASE,
  GROQ_CHAT_MODEL,
  groqAuthHeader,
} from "@/lib/groq-config";

export const runtime = "nodejs";

function bearerKey(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  const k = h.slice(7).trim();
  return k.length ? k : null;
}

type ChatTurn = { role: "user" | "assistant"; content: string };

type Body = {
  systemContent?: string;
  messages?: ChatTurn[];
  temperature?: number;
};

export async function POST(req: Request) {
  const apiKey = bearerKey(req);
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: "Missing or invalid Authorization header (Bearer token).",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const systemContent = String(body.systemContent ?? "").trim();
  if (!systemContent) {
    return new Response(JSON.stringify({ error: "systemContent is required." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const history = Array.isArray(body.messages) ? body.messages : [];
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemContent },
    ...history.map((m) => ({
      role: m.role,
      content: String(m.content ?? ""),
    })),
  ];

  const groq = await fetch(`${GROQ_API_BASE}/chat/completions`, {
    method: "POST",
    headers: { ...groqAuthHeader(apiKey), "Content-Type": "application/json" },
    body: JSON.stringify({
      model: GROQ_CHAT_MODEL,
      messages,
      temperature:
        typeof body.temperature === "number" ? body.temperature : 0.4,
      max_tokens: 4096,
      stream: true,
    }),
  });

  if (!groq.ok) {
    const errText = await groq.text();
    return new Response(
      JSON.stringify({
        error: errText || `Groq chat failed (${groq.status})`,
      }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(groq.body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      Connection: "keep-alive",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
