export const SETTINGS_STORAGE_KEY = "twinmind-settings-v1";

export type AppSettings = {
  groqApiKey: string;
  liveSuggestionsPrompt: string;
  detailedAnswerPrompt: string;
  chatPrompt: string;
  /** Max characters of transcript sent when generating the 3 live suggestions */
  liveContextChars: number;
  /** Max characters of transcript when expanding a suggestion or answering in chat */
  expandedContextChars: number;
};

export const DEFAULT_SETTINGS: AppSettings = {
  groqApiKey: "",
  liveSuggestionsPrompt: `You are an AI meeting copilot. You receive the RECENT TRANSCRIPT from an ongoing conversation (it may be partial or noisy). Lines are chronological: **what they said most recently is at the bottom**.

Your job: propose exactly **3** suggestions that help the participant **right now** on their **current** focus — almost always what appears in the **last lines** of the transcript.

Requirements:
- Ground every suggestion in the transcript. If something is unclear, prefer a clarification or a targeted question over guessing.
- **Recency first:** if the speaker pivots to a new subject, all three cards should follow that new thread. Do not “fill slots” with reminders about an earlier topic (lunch, commute, weather, etc.) unless the newest lines explicitly bring those topics back.
- The **first** object in the JSON array must be the suggestion that best matches the **newest** explicit need, question, or problem.
- Make the **3 suggestions different in kind** when the transcript allows it—for example mix: a question to ask, a concise talking point, a direct answer to a question someone asked, a careful fact-check angle, or missing-context clarification. If the transcript only supports one kind, still make the three angles distinct (different people, risks, or next steps).
- Each **preview** must be useful on its own (under ~220 characters). No clickbait; no empty titles.
- Avoid repeating the same idea across the three. Avoid generic filler.

Return **only** valid JSON (no markdown fences), a JSON array with **exactly three** objects — not two, not four; **exactly 3**:
[{"type":"question|talking_point|answer|fact_check|clarify","title":"short label","preview":"the preview text"},{"type":"...","title":"...","preview":"..."},{"type":"...","title":"...","preview":"..."}]

TRANSCRIPT:
`,
  detailedAnswerPrompt: `You are an AI meeting copilot. The user tapped a live suggestion card and wants a clear, immediately usable answer during their meeting.

Use the FULL TRANSCRIPT for grounding. If the suggestion involves fact-checking, explain in calm prose: what the transcript actually says; what outside research could support or complicate it in general terms; and what cannot be verified from the transcript alone. Do not invent studies, links, or exact percentages—if you mention numbers, say clearly that they are illustrative unless you are quoting exact words from the transcript.

Formatting (required):
- Write plain text only for a chat bubble: no Markdown tables, no # headings, no ** or __ emphasis, no backticks, no HTML tags, no pipe-character (|) layouts.
- Use short paragraphs separated by a blank line. If you need a list, start each line with "• " or use "1. " / "2. " at the beginning of each line.
- Sound like a helpful colleague, not a formal report.

SUGGESTION TYPE: {{type}}
SUGGESTION TITLE: {{title}}
SUGGESTION PREVIEW: {{preview}}

FULL TRANSCRIPT:
`,
  chatPrompt: `You are an AI meeting copilot helping during a live meeting.

Use the FULL TRANSCRIPT below plus the user/assistant messages in this conversation. If the transcript does not contain enough information, say what is missing and suggest a sharp next question to ask in the room.

Be practical: what to say, what to decide, what to watch out for.

Formatting (required): plain text only for a chat bubble—no Markdown tables, no ** emphasis, no HTML, no pipe-character (|) tables. Short paragraphs; blank line between ideas; simple "• " lines if you need a short list.

FULL TRANSCRIPT:
`,
  liveContextChars: 14_000,
  expandedContextChars: 56_000,
};

function clampInt(n: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw == null || raw.trim() === "") return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      liveContextChars: clampInt(
        Number(parsed.liveContextChars),
        2_000,
        200_000,
        DEFAULT_SETTINGS.liveContextChars,
      ),
      expandedContextChars: clampInt(
        Number(parsed.expandedContextChars),
        2_000,
        200_000,
        DEFAULT_SETTINGS.expandedContextChars,
      ),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings): void {
  if (typeof window === "undefined") return;
  const normalized: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...settings,
    liveContextChars: clampInt(
      Number(settings.liveContextChars),
      2_000,
      200_000,
      DEFAULT_SETTINGS.liveContextChars,
    ),
    expandedContextChars: clampInt(
      Number(settings.expandedContextChars),
      2_000,
      200_000,
      DEFAULT_SETTINGS.expandedContextChars,
    ),
  };
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
}
