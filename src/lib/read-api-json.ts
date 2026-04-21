/**
 * Read a fetch Response body as JSON, or throw with a readable message if the
 * server returned HTML/plain text (e.g. "Internal Server Error" during dev).
 */
export function tryParseJson<T extends object>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function readApiJson<T extends object>(
  r: Response,
  label: string,
): Promise<T> {
  const text = await r.text();
  if (!text.trim()) {
    throw new Error(`${label}: empty response (HTTP ${r.status})`);
  }
  const parsed = tryParseJson<T>(text);
  if (parsed === null) {
    const preview = text.replace(/\s+/g, " ").trim().slice(0, 240);
    throw new Error(
      `${label} returned non-JSON (HTTP ${r.status}). ${preview || "(no body)"}`,
    );
  }
  return parsed;
}
