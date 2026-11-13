# NONO · Frontend

The face of **NONO**, a personal voice AI assistant: a premium 3D holographic command center plus a 3D **neural memory explorer** where every instruction you have ever given NONO is a glowing neuron, still browsable decades from now.

Backend: [ai_jarvis_assistant_backend](https://github.com/Ebratul/ai_jarvis_assistant_backend) · Memory: [ai_jarvis_assistant_rag_agent](https://github.com/Ebratul/ai_jarvis_assistant_rag_agent)

## What's inside
**HUD (command center)**
* A real-time 3D AI core built with React Three Fiber and custom GLSL. It has a 7,000-particle noise-displaced sphere, fresnel energy shells, a rotating neural icosahedron, tilted orbit rings and segmented HUD arcs, comets, lightning arcs, light streaks, and a holographic platform with a light beam. Bloom, chromatic aberration and a vignette finish the look.
* The core reacts to NONO's state (idle, listening, thinking, speaking) and to live audio levels from the mic or voice playback.
* Left panels: system gauges (CPU, RAM, brain size), live AI-signal waveform and spectrum, brain-growth chart, activity by hour.
* Right panels: live alerts (reminders, Telegram, events), memory stream, shortcuts, agenda.
* Bottom dock: General / Realtime / Audio / Mute, a text box, and a push-to-talk mic.

**Brain (neural memory)**
* A 3D force-directed graph: core → categories → instructions, plus topic and year hubs and semantic synapses between similar instructions. Uses bloom and a starfield.
* Click a node to focus it and light up its connections. Shift-click a second node to trace the path between them.
* Includes search, an inspector (full instruction, NONO's answer, date, "x years ago", topics, tools, model, related memories, pin and delete), top hubs, and category filters.
* **Timeline:** filter by date range, jump to a year, or press ▶ to replay how your brain grew over time.
* Two color themes: by type, or a time heatmap (old memories in violet, new ones in cyan). JSONL export.

**Voice**
* **Realtime:** hands-free wake word. Say "**Nono**, …". After NONO answers, you have a few seconds to follow up without saying the wake word again.
* **General:** hold `Space` or the mic button to talk, or just type.
* ElevenLabs playback (5 voices) through WebAudio, so the 3D core moves with the voice. Falls back to the browser voice when ElevenLabs isn't available.
* Speech recognition in English and Bangla (Web Speech API). In browsers without it, audio goes to the backend's Whisper instead.

## Run
```bash
npm install
cp .env.example .env          # NONO_BACKEND=http://localhost:8000
npm run dev                   # → http://localhost:5173
```
Start the RAG agent and the backend first, or run `../backend/scripts/run_all.sh` to start everything.
Production: `npm run build` (static files in `dist/`), or `docker build .` (nginx, proxies `/api` and `/ws` to `backend:8000`).

Keyboard: `Space` hold to talk · `Esc` stop speaking · `B` toggle the brain view.

> Use Chrome or Edge for the hands-free wake word. Allow microphone access when asked.

## Stack
React 19 · TypeScript · Vite · three.js · @react-three/fiber + drei + postprocessing · react-force-graph-3d · zustand · lucide-react
