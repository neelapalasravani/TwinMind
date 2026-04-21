/**
 * Reads OpenAI-compatible SSE from Groq chat/completions stream.
 */
export async function accumulateSseContent(
  res: Response,
  onDelta: (chunk: string) => void,
): Promise<void> {
  if (!res.body) throw new Error("No response body.");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx).trimEnd();
      buffer = buffer.slice(idx + 1);

      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") return;

      try {
        const json = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const piece = json.choices?.[0]?.delta?.content;
        if (piece) onDelta(piece);
      } catch {
        // ignore malformed lines
      }
    }
  }
}
