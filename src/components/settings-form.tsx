"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type AppSettings,
} from "@/lib/settings-storage";

export function SettingsForm() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [hydrated, setHydrated] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    try {
      setSettings(loadSettings());
    } catch {
      setSettings(DEFAULT_SETTINGS);
    }
    setHydrated(true);
  }, []);

  const update = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(() => {
    saveSettings(settings);
    setSavedAt(Date.now());
  }, [settings]);

  const handleReset = useCallback(() => {
    const next = { ...DEFAULT_SETTINGS };
    setSettings(next);
    saveSettings(next);
    setSavedAt(Date.now());
  }, []);

  if (!hydrated) {
    return (
      <p className="text-sm text-zinc-500" aria-live="polite">
        Loading settings…
      </p>
    );
  }

  const inputClass =
    "mt-2 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500";

  return (
    <div className="space-y-8">
      <p className="text-sm text-zinc-500">
        Your API key and prompts are stored only in this browser (
        <span className="font-mono text-zinc-400">localStorage</span>). They
        are not sent to our servers—only to Groq when you use the app.
      </p>

      <div className="space-y-6 rounded-lg border border-zinc-800 bg-zinc-950/50 p-6">
        <div>
          <label
            htmlFor="groq-api-key"
            className="text-xs font-medium uppercase tracking-wide text-zinc-500"
          >
            Groq API key
          </label>
          <input
            id="groq-api-key"
            type="password"
            autoComplete="off"
            value={settings.groqApiKey}
            onChange={(e) => update("groqApiKey", e.target.value)}
            placeholder="gsk_…"
            className={inputClass}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="live-context"
              className="text-xs font-medium uppercase tracking-wide text-zinc-500"
            >
              Live suggestions — transcript context (max chars)
            </label>
            <input
              id="live-context"
              type="number"
              min={2000}
              max={200000}
              value={settings.liveContextChars}
              onChange={(e) =>
                update("liveContextChars", Number(e.target.value))
              }
              className={inputClass}
            />
          </div>
          <div>
            <label
              htmlFor="expanded-context"
              className="text-xs font-medium uppercase tracking-wide text-zinc-500"
            >
              Expanded answers &amp; chat — transcript context (max chars)
            </label>
            <input
              id="expanded-context"
              type="number"
              min={2000}
              max={200000}
              value={settings.expandedContextChars}
              onChange={(e) =>
                update("expandedContextChars", Number(e.target.value))
              }
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="live-prompt"
            className="text-xs font-medium uppercase tracking-wide text-zinc-500"
          >
            Live suggestions prompt
          </label>
          <p className="mt-1 text-xs text-zinc-600">
            Append the recent transcript in your API route before calling the
            model (this text is the instruction prefix).
          </p>
          <textarea
            id="live-prompt"
            rows={14}
            value={settings.liveSuggestionsPrompt}
            onChange={(e) => update("liveSuggestionsPrompt", e.target.value)}
            className={`${inputClass} resize-y font-mono text-xs leading-relaxed`}
          />
        </div>

        <div>
          <label
            htmlFor="detail-prompt"
            className="text-xs font-medium uppercase tracking-wide text-zinc-500"
          >
            Detailed answer (on suggestion click)
          </label>
          <p className="mt-1 text-xs text-zinc-600">
            Replace placeholders{" "}
            <code className="text-zinc-500">{"{{type}}"}</code>,{" "}
            <code className="text-zinc-500">{"{{title}}"}</code>,{" "}
            <code className="text-zinc-500">{"{{preview}}"}</code> in code
            when building the user message.
          </p>
          <textarea
            id="detail-prompt"
            rows={12}
            value={settings.detailedAnswerPrompt}
            onChange={(e) => update("detailedAnswerPrompt", e.target.value)}
            className={`${inputClass} resize-y font-mono text-xs leading-relaxed`}
          />
        </div>

        <div>
          <label
            htmlFor="chat-prompt"
            className="text-xs font-medium uppercase tracking-wide text-zinc-500"
          >
            Chat prompt (user messages)
          </label>
          <p className="mt-1 text-xs text-zinc-600">
            Prepend chat history and the user question after this instruction
            block.
          </p>
          <textarea
            id="chat-prompt"
            rows={10}
            value={settings.chatPrompt}
            onChange={(e) => update("chatPrompt", e.target.value)}
            className={`${inputClass} resize-y font-mono text-xs leading-relaxed`}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          className="rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white"
        >
          Save settings
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-900"
        >
          Reset to defaults
        </button>
        {savedAt !== null ? (
          <span className="text-sm text-zinc-500" aria-live="polite">
            Saved.
          </span>
        ) : null}
      </div>
    </div>
  );
}
