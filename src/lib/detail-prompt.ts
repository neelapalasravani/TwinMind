import type { Suggestion } from "@/lib/session-types";

export function fillDetailPrompt(template: string, s: Suggestion): string {
  return template
    .replaceAll("{{type}}", s.type)
    .replaceAll("{{title}}", s.title)
    .replaceAll("{{preview}}", s.preview);
}
