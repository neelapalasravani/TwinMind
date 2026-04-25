# TwinMind — Live Suggestions

Live meeting copilot prototype built for the TwinMind assignment.  
The app captures microphone audio, transcribes it in ~30s chunks, generates 
contextual live suggestions, and supports detailed follow-up chat.

---

## 🚀 Live Demo

👉 [https://twin-mind-theta.vercel.app](https://twin-mind-theta.vercel.app)

---

## 🧪 How to Test the Deployed App

Follow these steps to test the app end to end:

### Step 1 — Get a Groq API Key
1. Go to [console.groq.com](https://console.groq.com)
2. Sign up for a free account
3. Navigate to **API Keys** and create a new key
4. Copy the key

### Step 2 — Add Your API Key in Settings
1. Open the deployed app
2. Click the **Settings** button
3. Paste your Groq API key in the API key field
4. Click **Save**

### Step 3 — Start Recording
1. Click the **Start Mic** button in the left column
2. Allow microphone access when the browser asks
3. Start speaking — talk about any topic naturally
4. Every **30 seconds** a new transcript chunk will appear

### Step 4 — View Live Suggestions
1. After the first 30 seconds, **3 suggestions** will appear in the middle column
2. Each suggestion is a tappable card with a short preview
3. New suggestions appear every 30 seconds at the top
4. Older suggestions stay visible below
5. Use the **Refresh** button to manually trigger new suggestions

### Step 5 — Use the Chat Panel
1. Click any suggestion card to open a detailed answer in the right chat panel
2. Or type your own question directly in the chat input
3. The chat uses the full transcript as context for answers

### Step 6 — Export the Session
1. Click the **Export** button
2. A JSON file will download with:
   - Full transcript with timestamps
   - Every suggestion batch with timestamps
   - Full chat history with timestamps

### Step 7 — Stop Recording
1. Click **Stop Mic** when done
2. Final transcript and suggestions will be generated

---

## ✨ Features

- **Three-column workspace**
- **Transcript (left):** appends and auto-scrolls transcription while recording
- **Live suggestions (middle):** generates 3 fresh, tappable suggestions 
  from recent transcript context
- **Chat (right):** clicking a suggestion streams a deeper response; 
  users can also type direct questions
- **Settings page**
  - Add your Groq API key
  - Edit prompt templates and context window limits
- **Session export**
  - Export transcript, suggestion batches, and chat history with timestamps

---

## 🛠️ Tech Stack

- **Next.js** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **Groq APIs**
  - Whisper Large V3 — transcription
  - GPT-OSS 120B — suggestions + chat

---

## 💻 Run Locally

### Prerequisites
- Node.js LTS (includes npm)

```bash
node -v
npm -v
```

### Install and Start

From the project root:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## 🧠 Prompt Strategy

### Live Suggestions
- Passes the **last 2 minutes** of transcript as primary context
- Uses a **summarized version** of earlier transcript for broader context
- Generates exactly **3 suggestions** with mixed types:
  - Question to ask
  - Talking point to raise
  - Fact check or clarifying info
  - Direct answer to something just asked
- Suggestion type is chosen **based on context** — not random

### Chat Answers
- Passes the **full transcript** as context
- Generates detailed, actionable responses
- Maintains **one continuous chat** per session

---

## ⚖️ Tradeoffs

- **30 second chunks** — balances latency vs suggestion freshness
- **Context window** — last 2 minutes gives enough context without 
  overwhelming the model
- **Plain JSON export** — simple and easy to evaluate without extra tooling
- **No data persistence** — keeps the app simple and focused on 
  the core experience

---

## 📁 Project Structure

```
/app
  /api          → Groq API route handlers
  /components   → UI components (transcript, suggestions, chat)
  /settings     → Settings page
/public         → Static assets
README.md
```
