# TwinMind — Live suggestions (assignment)

## Step 1 — Run the app locally

### Prerequisites

- [Node.js](https://nodejs.org/) **LTS** (includes `npm`). In Terminal, check:

  ```bash
  node -v
  npm -v
  ```

  Both commands should print a version number.

### Install and start

From this folder:

```bash
cd /Users/sravani/Desktop/TwinMind
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You should see the Step 1 welcome screen.

### What’s next (Step 2)

- Three-column layout: transcript (left), suggestions (middle), chat (right).
- A **Settings** screen for the Groq API key and editable prompts.

## Stack (planned)

- **Next.js** (App Router) + **TypeScript** + **Tailwind CSS**
- **Groq**: Whisper Large V3 (transcription), GPT-OSS 120B (suggestions + chat)

## Note

`TwinMind.pdf` in this folder is your assignment brief — it is not used by the app.
