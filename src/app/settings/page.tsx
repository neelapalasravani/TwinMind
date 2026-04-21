import Link from "next/link";
import { SettingsFormLoader } from "./settings-form-loader";

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0b] text-zinc-100">
      <header className="flex h-14 items-center border-b border-zinc-800 px-4">
        <Link
          href="/"
          className="text-sm text-zinc-400 transition hover:text-zinc-200"
        >
          ← Back
        </Link>
      </header>

      <main className="mx-auto max-w-3xl p-6 pb-16">
        <h1 className="text-xl font-semibold text-zinc-100">Settings</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Paste your Groq API key and tune prompts. Models are fixed for the
          assignment: Whisper Large V3 (transcription) and GPT-OSS 120B
          (suggestions and chat).
        </p>

        <div className="mt-8">
          <SettingsFormLoader />
        </div>
      </main>
    </div>
  );
}
