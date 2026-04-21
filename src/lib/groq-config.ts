/** Groq OpenAI-compatible API. Assignment: Whisper Large V3 + GPT-OSS 120B. */
export const GROQ_API_BASE = "https://api.groq.com/openai/v1";

export const GROQ_WHISPER_MODEL = "whisper-large-v3";
export const GROQ_CHAT_MODEL = "openai/gpt-oss-120b";

export function groqAuthHeader(apiKey: string): HeadersInit {
  return { Authorization: `Bearer ${apiKey.trim()}` };
}

export function tailText(text: string, maxChars: number): string {
  const t = text.trim();
  if (t.length <= maxChars) return t;
  return t.slice(-maxChars);
}
