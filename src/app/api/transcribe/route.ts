import { NextResponse } from "next/server";
import {
  GROQ_API_BASE,
  GROQ_WHISPER_MODEL,
  groqAuthHeader,
} from "@/lib/groq-config";

export const runtime = "nodejs";

function bearerKey(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  const k = h.slice(7).trim();
  return k.length ? k : null;
}

export async function POST(req: Request) {
  const apiKey = bearerKey(req);
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing or invalid Authorization header (Bearer token)." },
      { status: 401 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "Missing file field." }, { status: 400 });
  }

  const name =
    file instanceof File && file.name?.trim()
      ? file.name
      : "chunk.webm";
  const type = file.type?.trim() || "audio/webm";
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength < 1024) {
    return NextResponse.json(
      { error: "Audio chunk too small to transcribe." },
      { status: 400 },
    );
  }

  const out = new FormData();
  out.append("file", new Blob([bytes], { type }), name);
  out.append("model", GROQ_WHISPER_MODEL);

  const groq = await fetch(`${GROQ_API_BASE}/audio/transcriptions`, {
    method: "POST",
    headers: groqAuthHeader(apiKey),
    body: out,
  });

  const raw = await groq.text();
  if (!groq.ok) {
    let message = raw || `Groq transcription failed (${groq.status})`;
    try {
      const j = JSON.parse(raw) as { error?: { message?: string } };
      if (j?.error?.message) message = j.error.message;
    } catch {
      /* keep raw */
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }

  try {
    const json = JSON.parse(raw) as { text?: string };
    const text = (json.text ?? "").trim();
    return NextResponse.json({ text });
  } catch {
    return NextResponse.json(
      { error: "Unexpected Groq transcription response." },
      { status: 502 },
    );
  }
}
