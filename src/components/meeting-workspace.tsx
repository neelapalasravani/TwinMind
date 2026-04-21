"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { fillDetailPrompt } from "@/lib/detail-prompt";
import { tailText } from "@/lib/groq-config";
import { readApiJson, tryParseJson } from "@/lib/read-api-json";
import { accumulateSseContent } from "@/lib/read-sse-chat";
import { loadSettings } from "@/lib/settings-storage";
import type {
  ChatMessage,
  Suggestion,
  SuggestionBatch,
  TranscriptChunk,
} from "@/lib/session-types";

function transcriptText(chunks: TranscriptChunk[]): string {
  return chunks.map((c) => c.text).join("\n");
}

function transcriptForExport(chunks: TranscriptChunk[]): string {
  return chunks.map((c) => `[${c.at}] ${c.text}`).join("\n");
}

/** Groq rejects tiny or incomplete WebM blobs (common on MediaRecorder flush). */
const MIN_TRANSCRIBE_BYTES = 3 * 1024;

/** Min time between auto suggestion runs (after each audio chunk). Manual Refresh is always allowed. */
const AUTO_SUGGESTIONS_MIN_INTERVAL_MS = 90_000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function blobFilename(blob: Blob): string {
  const t = blob.type.toLowerCase();
  if (t.includes("mp4") || t.includes("m4a")) return "chunk.m4a";
  if (t.includes("ogg")) return "chunk.ogg";
  return "chunk.webm";
}

function formatMmSs(totalSec: number): string {
  const s = Math.max(0, Math.min(99 * 60 + 59, Math.floor(totalSec)));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function MeetingWorkspace() {
  const [chunks, setChunks] = useState<TranscriptChunk[]>([]);
  const [batches, setBatches] = useState<SuggestionBatch[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [recording, setRecording] = useState(false);
  const [busyTranscribing, setBusyTranscribing] = useState(false);
  const [busySuggesting, setBusySuggesting] = useState(false);
  const [busyChat, setBusyChat] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [chunkElapsedSec, setChunkElapsedSec] = useState(0);

  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chatRef = useRef<ChatMessage[]>([]);
  const chunksRef = useRef<TranscriptChunk[]>([]);
  const chunkWindowStartRef = useRef<number>(0);
  /** One transcription (+ suggestions) at a time — avoids parallel Groq calls and flaky 502s. */
  const transcribeChainRef = useRef<Promise<void>>(Promise.resolve());
  /** One suggestions request at a time — avoids out-of-order batches when manual + auto overlap. */
  const suggestionsChainRef = useRef<Promise<void>>(Promise.resolve());
  /** Last successful suggestions fetch (manual or auto); used to throttle auto-only runs. */
  const lastSuggestionsSuccessMsRef = useRef(0);
  /** True while the user wants recording (stays true across 30s segment restarts). */
  const recordingIntentRef = useRef(false);
  const segmentIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    chatRef.current = chatMessages;
  }, [chatMessages]);

  useEffect(() => {
    chunksRef.current = chunks;
  }, [chunks]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chunks]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  /** ~30s chunk window aligned with MediaRecorder timeslice. */
  useEffect(() => {
    if (!recording) {
      setChunkElapsedSec(0);
      return;
    }
    const id = window.setInterval(() => {
      const sec = Math.floor(
        (Date.now() - chunkWindowStartRef.current) / 1000,
      );
      setChunkElapsedSec(Math.min(sec, 30));
    }, 200);
    return () => window.clearInterval(id);
  }, [recording]);

  /** Blink / pulse when input level suggests someone is speaking. */
  useEffect(() => {
    if (!recording) {
      setSpeaking(false);
      return;
    }
    const stream = streamRef.current;
    if (!stream) return;

    const AC =
      window.AudioContext ||
      (
        window as unknown as {
          webkitAudioContext: typeof AudioContext;
        }
      ).webkitAudioContext;
    const ctx = new AC();
    void ctx.resume();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);

    const buf = new Uint8Array(analyser.fftSize);
    let raf = 0;

    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i]! - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);
      setSpeaking(rms > 0.018);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      src.disconnect();
      void ctx.close();
    };
  }, [recording]);

  const refreshSuggestions = useCallback(
    async (opts?: { warnIfEmpty?: boolean; auto?: boolean }) => {
      const run = async () => {
        const settings = loadSettings();
        if (!settings.groqApiKey.trim()) {
          if (opts?.warnIfEmpty) {
            setError("Add your Groq API key in Settings.");
          }
          return;
        }
        const full = transcriptText(chunksRef.current);
        if (!full.trim()) {
          if (opts?.warnIfEmpty) {
            setError(
              "Transcript is empty — start the mic and wait for a chunk (~30s).",
            );
          }
          return;
        }

        if (opts?.auto) {
          const prev = lastSuggestionsSuccessMsRef.current;
          if (
            prev > 0 &&
            Date.now() - prev < AUTO_SUGGESTIONS_MIN_INTERVAL_MS
          ) {
            return;
          }
        }

        setBusySuggesting(true);
        setError(null);
        try {
          const r = await fetch("/api/suggestions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${settings.groqApiKey}`,
            },
            body: JSON.stringify({
              promptPrefix: settings.liveSuggestionsPrompt,
              transcript: full,
              maxChars: settings.liveContextChars,
            }),
          });
          const j = await readApiJson<{
            suggestions?: Suggestion[];
            error?: string;
            raw?: string;
          }>(r, "/api/suggestions");
          if (!r.ok) {
            const extra = j.raw ? `\n\nModel output (truncated): ${j.raw}` : "";
            throw new Error((j.error ?? "Suggestions request failed") + extra);
          }
          if (!j.suggestions?.length) {
            throw new Error("No suggestions returned.");
          }
          const batch: SuggestionBatch = {
            id: crypto.randomUUID(),
            at: new Date().toISOString(),
            suggestions: j.suggestions,
          };
          setBatches((prev) => {
            const next = [batch, ...prev];
            return [...next].sort(
              (a, b) =>
                new Date(b.at).getTime() - new Date(a.at).getTime(),
            );
          });
          lastSuggestionsSuccessMsRef.current = Date.now();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Suggestions error.");
        } finally {
          setBusySuggesting(false);
        }
      };

      const p = suggestionsChainRef.current.then(run);
      suggestionsChainRef.current = p.catch(() => {});
      await p;
    },
    [],
  );

  const transcribeBlob = useCallback(
    async (blob: Blob) => {
      if (blob.size < MIN_TRANSCRIBE_BYTES) return;

      const settings = loadSettings();
      if (!settings.groqApiKey.trim()) return;

      setBusyTranscribing(true);
      setError(null);
      try {
        const name = blobFilename(blob);
        const file = new File([blob], name, {
          type: blob.type || "audio/webm",
        });

        let lastMsg = "Transcription failed.";
        let text = "";

        for (let attempt = 0; attempt < 3; attempt++) {
          if (attempt > 0) await sleep(500 * attempt);
          const fd = new FormData();
          fd.append("file", file);
          const r = await fetch("/api/transcribe", {
            method: "POST",
            headers: { Authorization: `Bearer ${settings.groqApiKey}` },
            body: fd,
          });
          const j = await readApiJson<{ text?: string; error?: string }>(
            r,
            "/api/transcribe",
          );
          if (r.ok) {
            text = (j.text ?? "").trim();
            break;
          }
          lastMsg = j.error ?? `HTTP ${r.status}`;
          const maybeMedia =
            /valid media|invalid_request|could not process file/i.test(lastMsg);
          const maybeRate = r.status === 429 || /rate|limit|too many/i.test(lastMsg);
          if (attempt < 2 && (maybeMedia || maybeRate || r.status === 502)) {
            continue;
          }
          throw new Error(lastMsg);
        }

        if (!text) return;

        const piece: TranscriptChunk = {
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          text,
        };
        const nextChunks = [...chunksRef.current, piece];
        chunksRef.current = nextChunks;
        setChunks(nextChunks);
        await refreshSuggestions({ auto: true });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Transcription error.");
      } finally {
        setBusyTranscribing(false);
      }
    },
    [refreshSuggestions],
  );

  const startRecording = useCallback(async () => {
    const settings = loadSettings();
    if (!settings.groqApiKey.trim()) {
      setError("Add your Groq API key in Settings.");
      return;
    }
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      recordingIntentRef.current = true;
      transcribeChainRef.current = Promise.resolve();

      let mime = "audio/webm;codecs=opus";
      if (!MediaRecorder.isTypeSupported(mime)) mime = "audio/webm";

      const enqueueBlob = (blob: Blob) => {
        chunkWindowStartRef.current = Date.now();
        if (blob.size < MIN_TRANSCRIBE_BYTES) return;
        transcribeChainRef.current = transcribeChainRef.current
          .then(() => transcribeBlob(blob))
          .catch((e) => {
            setError(e instanceof Error ? e.message : "Chunk error.");
          });
      };

      const beginSegment = () => {
        if (!recordingIntentRef.current || !streamRef.current) return;

        try {
          let mr: MediaRecorder;
          try {
            mr = new MediaRecorder(streamRef.current, {
              mimeType: mime,
              audioBitsPerSecond: 128_000,
            });
          } catch {
            mr = new MediaRecorder(streamRef.current, { mimeType: mime });
          }
          mediaRecorderRef.current = mr;
          chunkWindowStartRef.current = Date.now();

          mr.ondataavailable = (ev) => {
            chunkWindowStartRef.current = Date.now();
            if (!ev.data || ev.data.size < 1) return;
            enqueueBlob(ev.data);
          };

          mr.onstop = () => {
            if (
              recordingIntentRef.current &&
              streamRef.current &&
              streamRef.current.active
            ) {
              queueMicrotask(() => {
                if (
                  recordingIntentRef.current &&
                  streamRef.current?.active
                ) {
                  beginSegment();
                }
              });
            }
          };

          mr.start();
        } catch (e) {
          recordingIntentRef.current = false;
          if (segmentIntervalRef.current !== null) {
            window.clearInterval(segmentIntervalRef.current);
            segmentIntervalRef.current = null;
          }
          streamRef.current?.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          setRecording(false);
          setError(
            e instanceof Error
              ? e.message
              : "Could not start a new audio segment.",
          );
        }
      };

      beginSegment();

      if (segmentIntervalRef.current !== null) {
        window.clearInterval(segmentIntervalRef.current);
      }
      segmentIntervalRef.current = window.setInterval(() => {
        if (!recordingIntentRef.current) return;
        const r = mediaRecorderRef.current;
        if (r && r.state === "recording") r.stop();
      }, 30_000);

      setRecording(true);
    } catch {
      recordingIntentRef.current = false;
      setError("Microphone permission denied or unavailable.");
    }
  }, [transcribeBlob]);

  const stopRecording = useCallback(() => {
    recordingIntentRef.current = false;
    if (segmentIntervalRef.current !== null) {
      window.clearInterval(segmentIntervalRef.current);
      segmentIntervalRef.current = null;
    }
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") {
      mr.stop();
    }
    mediaRecorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setRecording(false);
    setSpeaking(false);
  }, []);

  const streamAssistant = useCallback(
    async (history: ChatMessage[], systemContent: string) => {
      const settings = loadSettings();
      if (!settings.groqApiKey.trim()) {
        setError("Add your Groq API key in Settings.");
        return;
      }

      const assistantId = crypto.randomUUID();
      const assistant: ChatMessage = {
        id: assistantId,
        at: new Date().toISOString(),
        role: "assistant",
        content: "",
      };

      setChatMessages([...history, assistant]);
      setBusyChat(true);
      setError(null);

      try {
        const r = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${settings.groqApiKey}`,
          },
          body: JSON.stringify({
            systemContent,
            messages: history.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            temperature: 0.4,
          }),
        });

        if (!r.ok) {
          const text = await r.text();
          const j = tryParseJson<{ error?: string }>(text);
          if (j?.error) throw new Error(j.error);
          const preview = text.replace(/\s+/g, " ").trim().slice(0, 200);
          throw new Error(
            preview
              ? `Chat failed (HTTP ${r.status}): ${preview}`
              : `Chat failed (HTTP ${r.status}).`,
          );
        }

        await accumulateSseContent(r, (delta) => {
          setChatMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: m.content + delta }
                : m,
            ),
          );
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Chat error.");
        setChatMessages((prev) => prev.filter((m) => m.id !== assistantId));
      } finally {
        setBusyChat(false);
      }
    },
    [],
  );

  const sendUserMessage = useCallback(
    async (visible: string, systemContent: string) => {
      if (!visible.trim() || busyChat) return;
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        role: "user",
        content: visible.trim(),
      };
      const history = [...chatRef.current, userMsg];
      setChatMessages(history);
      await streamAssistant(history, systemContent);
    },
    [busyChat, streamAssistant],
  );

  const onSubmitChat = useCallback(async () => {
    const settings = loadSettings();
    const full = transcriptForExport(chunksRef.current);
    const systemContent =
      settings.chatPrompt + tailText(full, settings.expandedContextChars);
    const text = chatInput;
    setChatInput("");
    await sendUserMessage(text, systemContent);
  }, [chatInput, sendUserMessage]);

  const onSuggestionClick = useCallback(
    async (s: Suggestion) => {
      const settings = loadSettings();
      const full = transcriptForExport(chunksRef.current);
      const systemContent =
        fillDetailPrompt(settings.detailedAnswerPrompt, s) +
        tailText(full, settings.expandedContextChars);
      const visible = `Suggestion — ${s.title}\n${s.preview}`;
      await sendUserMessage(visible, systemContent);
    },
    [sendUserMessage],
  );

  const exportSession = useCallback(() => {
    const payload = {
      exportedAt: new Date().toISOString(),
      transcript: chunksRef.current,
      suggestionBatches: batches,
      chat: chatRef.current,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `twinmind-session-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [batches]);

  const micBusy = busyTranscribing;

  return (
    <div className="flex h-screen min-h-0 flex-col bg-[#0a0a0b] text-zinc-100">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-800 px-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-zinc-200">
            TwinMind — Live suggestions
          </span>
          <button
            type="button"
            onClick={exportSession}
            className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-900"
          >
            Export session
          </button>
        </div>
        <Link
          href="/settings"
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 transition hover:bg-zinc-800"
        >
          Settings
        </Link>
      </header>

      {error ? (
        <div className="shrink-0 border-b border-amber-900/50 bg-amber-950/40 px-4 py-2 text-sm text-amber-100">
          {error}
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-3">
        <section className="flex min-h-0 flex-col border-b border-zinc-800 md:border-b-0 md:border-r">
          <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-4 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Transcript
            </h2>
            <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
              {recording ? (
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <span
                    className="font-mono tabular-nums text-zinc-300"
                    title="Time into the current ~30s capture window"
                  >
                    {formatMmSs(chunkElapsedSec)}
                    <span className="text-zinc-600"> / 0:30</span>
                  </span>
                  <span className="hidden sm:inline text-zinc-600">·</span>
                  <span className="max-w-[120px] truncate sm:max-w-none text-zinc-500">
                    ~30s chunks
                  </span>
                </div>
              ) : null}
              {micBusy ? (
                <span className="text-xs text-zinc-500">Transcribing…</span>
              ) : null}
              {!recording ? (
                <button
                  type="button"
                  onClick={() => void startRecording()}
                  className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500"
                >
                  Start mic
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopRecording}
                  title={
                    speaking
                      ? "Speaking detected (mic active)"
                      : "Recording — speak to see the pulse"
                  }
                  className={`rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-500 ${
                    speaking ? "twinmind-mic-speaking" : ""
                  }`}
                >
                  Stop mic
                </button>
              )}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm leading-relaxed">
            {chunks.length === 0 ? (
              <p className="text-zinc-500">
                Start the mic. Audio is captured in ~30s segments (each
                segment is a full file for more reliable transcription) and
                appended here.
              </p>
            ) : (
              <ul className="space-y-3">
                {chunks.map((c) => (
                  <li key={c.id} className="text-zinc-300">
                    <span className="font-mono text-[10px] text-zinc-500">
                      {new Date(c.at).toLocaleTimeString()}
                    </span>
                    <p className="mt-0.5 whitespace-pre-wrap">{c.text}</p>
                  </li>
                ))}
              </ul>
            )}
            <div ref={transcriptEndRef} />
          </div>
        </section>

        <section className="flex min-h-0 flex-col border-b border-zinc-800 md:border-b-0 md:border-r">
          <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-4 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Live suggestions
            </h2>
            <button
              type="button"
              disabled={busySuggesting}
              onClick={() => void refreshSuggestions({ warnIfEmpty: true })}
              className="rounded-md border border-zinc-600 bg-zinc-900 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
              title="Fetch another set of 3 suggestions from the current transcript"
            >
              {busySuggesting ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          <p className="shrink-0 border-b border-zinc-800 px-4 py-2 text-[11px] leading-relaxed text-zinc-500">
            Each batch is three cards. If you do not like them, click Refresh
            to generate another three from the same transcript (new batch on
            top; older batches stay below).
          </p>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {batches.length === 0 ? (
              <p className="text-sm text-zinc-500">
                While recording, suggestions auto-refresh after new transcript
                arrives, at most once every{" "}
                {AUTO_SUGGESTIONS_MIN_INTERVAL_MS / 1000} seconds so batches do
                not repeat every audio chunk. You can always use Refresh for
                another three cards. New batches appear on top.
              </p>
            ) : (
              <ul className="space-y-5">
                {batches.map((batch) => (
                  <li
                    key={batch.id}
                    className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3"
                  >
                    <p className="mb-3 font-mono text-[10px] font-medium text-zinc-400">
                      Batch · {new Date(batch.at).toLocaleString()}
                    </p>
                    <ul className="space-y-2">
                      {batch.suggestions.map((s, i) => (
                        <li
                          key={`${batch.id}-${i}-${s.title.slice(0, 24)}`}
                        >
                          <button
                            type="button"
                            onClick={() => void onSuggestionClick(s)}
                            disabled={busyChat}
                            className="w-full rounded-lg border border-zinc-800 bg-zinc-900/80 p-3 text-left transition hover:border-zinc-600 hover:bg-zinc-900 disabled:opacity-50"
                          >
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                              {s.type.replaceAll("_", " ")}
                            </span>
                            <p className="mt-1 text-sm font-medium text-zinc-100">
                              {s.title}
                            </p>
                            <p className="mt-1 text-sm text-zinc-400">
                              {s.preview}
                            </p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-col">
          <div className="shrink-0 border-b border-zinc-800 px-4 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Chat
            </h2>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <ul className="space-y-3">
              {chatMessages.map((m) => (
                <li
                  key={m.id}
                  className={
                    m.role === "user"
                      ? "rounded-lg bg-zinc-900/60 p-3 text-sm text-zinc-200"
                      : "rounded-lg border border-zinc-800 p-3 text-sm text-zinc-300"
                  }
                >
                  <span className="font-mono text-[10px] text-zinc-500">
                    {m.role} · {new Date(m.at).toLocaleTimeString()}
                  </span>
                  <p className="mt-1 whitespace-pre-wrap">{m.content}</p>
                </li>
              ))}
              <div ref={chatEndRef} />
            </ul>
          </div>
          <div className="shrink-0 border-t border-zinc-800 p-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                disabled={busyChat}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void onSubmitChat();
                  }
                }}
                placeholder="Ask a question…"
                className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
              />
              <button
                type="button"
                disabled={busyChat || !chatInput.trim()}
                onClick={() => void onSubmitChat()}
                className="rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
