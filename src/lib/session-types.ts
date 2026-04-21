export type TranscriptChunk = {
  id: string;
  at: string; // ISO
  text: string;
};

export type Suggestion = {
  type: string;
  title: string;
  preview: string;
};

export type SuggestionBatch = {
  id: string;
  at: string;
  suggestions: Suggestion[];
};

export type ChatMessage = {
  id: string;
  at: string;
  role: "user" | "assistant";
  content: string;
};
