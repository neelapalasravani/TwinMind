import { NextResponse } from "next/server";
import {
  GROQ_API_BASE,
  GROQ_CHAT_MODEL,
  groqAuthHeader,
  tailText,
} from "@/lib/groq-config";
import { parseSuggestionsJson } from "@/lib/suggestions-parse";

export const runtime = "nodejs";

function bearerKey(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  const k = h.slice(7).trim();
  return k.length ? k : null;
}

type Body = {
  promptPrefix?: string;
  transcript?: string;
  maxChars?: number;
};

export async function POST(req: Request) {
  const apiKey = bearerKey(req);
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing or invalid Authorization header (Bearer token)." },
      { status: 401 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const promptPrefix = String(body.promptPrefix ?? "");
  const transcript = String(body.transcript ?? "");
  const maxChars = Number(body.maxChars);
  const slice = tailText(
    transcript,
    Number.isFinite(maxChars) && maxChars > 0 ? maxChars : 14_000,
  );

  if (!slice.trim()) {
    return NextResponse.json(
      { error: "Transcript is empty — record some audio first." },
      { status: 400 },
    );
  }

  const strictTail =
    "\n\nCRITICAL: Respond with ONLY a JSON array containing EXACTLY 3 objects. Each object MUST have keys: type, title, preview. No markdown fences, no commentary before or after the array.";

  /** Appended after transcript so pivots (e.g. lunch → power cut) stay on the newest thread. */
  const recencyBlock = `

---
RECENCY (mandatory):
The excerpt is chronological: older lines first, **newest lines last**.
- **All 3** suggestions must primarily help with what the speaker is focused on in the **final part** of the transcript (the last lines they said). Treat earlier lines as background only.
- If they clearly **moved to a new topic**, do **not** use a card to continue an old topic (meals, traffic, weather, etc.) unless the **newest** lines explicitly ask to tie topics together.
- Put the suggestion that best matches the **newest** explicit question, problem, or decision **first** in the JSON array (array index 0 = highest priority).
`;

  let lastContent = "";
  let lastError = "Could not obtain 3 valid suggestions.";

  for (let attempt = 0; attempt < 3; attempt++) {
    const userContent =
      attempt === 0
        ? `${promptPrefix}${slice}${recencyBlock}`
        : `${promptPrefix}${slice}${recencyBlock}${strictTail}\n\n(Attempt ${attempt + 1}: previous output was not a valid JSON array of exactly 3 items. Fix it.)`;

    const groq = await fetch(`${GROQ_API_BASE}/chat/completions`, {
      method: "POST",
      headers: { ...groqAuthHeader(apiKey), "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GROQ_CHAT_MODEL,
        messages: [{ role: "user", content: userContent }],
        temperature: attempt === 0 ? 0.5 : 0.25,
        max_tokens: 1024,
      }),
    });

    const raw = await groq.text();
    if (!groq.ok) {
      lastError = raw || `Groq chat failed (${groq.status})`;
      continue;
    }

    let content: string;
    try {
      const json = JSON.parse(raw) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      content = json.choices?.[0]?.message?.content ?? "";
    } catch {
      lastError = "Unexpected Groq chat response shape.";
      continue;
    }

    lastContent = content;
    try {
      const suggestions = parseSuggestionsJson(content);
      return NextResponse.json({ suggestions });
    } catch (e) {
      lastError = e instanceof Error ? e.message : "Parse error";
    }
  }

  return NextResponse.json(
    {
      error: `${lastError} Raw model output (last attempt) is included for debugging.`,
      raw: lastContent.slice(0, 8000),
    },
    { status: 422 },
  );
}
