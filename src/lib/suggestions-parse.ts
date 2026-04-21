import type { Suggestion } from "@/lib/session-types";

function stripCodeFences(raw: string): string {
  let s = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(s);
  if (fence) s = fence[1].trim();
  return s;
}

export function parseSuggestionsJson(raw: string): Suggestion[] {
  const s = stripCodeFences(raw);
  const parsed = JSON.parse(s) as unknown;
  let list: unknown[];
  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (
    parsed &&
    typeof parsed === "object" &&
    Array.isArray((parsed as { suggestions?: unknown }).suggestions)
  ) {
    list = (parsed as { suggestions: unknown[] }).suggestions;
  } else {
    throw new Error("Model output was not a JSON array (or { suggestions: [] }).");
  }
  const out: Suggestion[] = [];
  for (const item of list) {
    if (out.length >= 3) break;
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const type = String(o.type ?? "clarify");
    const title = String(o.title ?? "").trim();
    const preview = String(o.preview ?? "").trim();
    if (!title && !preview) continue;
    out.push({ type, title: title || "Suggestion", preview });
  }
  if (out.length === 0) {
    throw new Error("Model returned no usable suggestions.");
  }
  return padSuggestionsToThree(out);
}

/** Short transcripts often yield 1–2 model cards; UI always shows three slots. */
function padSuggestionsToThree(suggestions: Suggestion[]): Suggestion[] {
  const r = [...suggestions];
  while (r.length < 3) {
    r.push({
      type: "clarify",
      title: `More context (${r.length + 1}/3)`,
      preview:
        "The transcript is very short. Say a few more sentences so the next refresh can suggest meeting-specific ideas.",
    });
  }
  return r.slice(0, 3);
}
