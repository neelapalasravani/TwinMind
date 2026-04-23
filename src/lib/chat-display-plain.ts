/**
 * Makes assistant chat easier to read in a plain-text UI (no markdown renderer).
 * Conservative: only touches obvious markdown/table/HTML artifacts.
 */
export function formatChatForPlainDisplay(raw: string): string {
  let s = raw.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>\s*/gi, "\n");

  const lines = s.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (
      /^\|?\s*:?[-\s]+\s*(\|\s*:?[-\s]+\s*)+\|?\s*$/.test(t) &&
      t.includes("-")
    ) {
      continue;
    }
    if (t.includes("|") && (t.startsWith("|") || t.endsWith("|"))) {
      const cells = t
        .split("|")
        .map((c) => c.trim())
        .filter((c) => c.length > 0);
      if (cells.length >= 2) {
        out.push(cells.join(" — "));
        continue;
      }
    }
    out.push(line);
  }
  s = out.join("\n");

  s = s.replace(/\*\*([^*]+)\*\*/g, "$1");
  s = s.replace(/\*([^*]+)\*/g, "$1");
  return s.replace(/\n{4,}/g, "\n\n\n");
}
