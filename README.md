# AI-First CRM — HCP Interaction Logging Module

> Task 1: Conceptualize and outline the key components of an AI-first CRM HCP module.
> **Log Interaction Screen** — fully driven by an LLM agent. **Zero manual form filling.**

## What this is

A web app where a pharma field rep:

1. **Logs an HCP interaction** by typing a single natural-language prompt
   (e.g. *"Met Dr. Sharma today at 3pm, discussed OncoBoost Phase III data,
   she was very enthusiastic, shared the brochure"*).
2. The **LangGraph agent** routes the prompt, extracts every field, fills the
   form, and proposes follow-up actions.
3. If the rep spots a wrong field, they type another prompt
   (e.g. *"Actually it was Dr. Smith, not Sharma, and sentiment was neutral"*)
   and the same agent **patches only those fields**.

The form fields are **read-only in the UI** — the rep never types into them.
All changes flow through the LangGraph agent → Groq `gemma2-9b-it`.

## Architecture

```
┌──────────────────────┐    POST /agent    ┌──────────────────────────┐
│ React UI (Vite + TS) │ ────────────────▶ │  Agent endpoint          │
│ - Read-only form     │                   │  (live: Edge Function    │
│ - Chat assistant     │ ◀──── JSON ────── │   ref: FastAPI/Python)   │
└──────────────────────┘                   └──────────┬───────────────┘
                                                      │
                                            ┌─────────▼─────────┐
                                            │   LangGraph       │
                                            │  ┌─────────────┐  │
                                            │  │ 1. Router   │  │
                                            │  └──────┬──────┘  │
                                            │   ┌────┼────┬────┐│
                                            │   ▼    ▼    ▼    ▼│
                                            │  Log  Edit Sum Sug│
                                            │   └────┬────┴────┘│
                                            │        ▼          │
                                            │   Groq gemma2-9b  │
                                            └───────────────────┘
```

### Two implementations of the same agent

| | Live (in this repo) | Reference (in `/backend`) |
|---|---|---|
| Runtime | Deno edge function | Python FastAPI |
| Orchestration | Hand-rolled state graph (mirrors LangGraph topology) | **LangGraph** `StateGraph` |
| LLM | **Groq `gemma2-9b-it`** | **Groq `gemma2-9b-it`** |
| Why two? | The hosting platform (Lovable Cloud) runs Deno, so the live demo had to be ported. The Python version is the canonical implementation per the task brief. |

## The 5 LangGraph Tools (Nodes)

| # | Tool | Purpose |
|---|------|---------|
| 1 | **RouterTool** | LLM classifies user intent: `log` / `edit` / `summarize` / `suggest` / `chat` |
| 2 | **LogInteractionTool** | LLM extracts every form field via Groq tool-calling — entity extraction + summarization in one shot |
| 3 | **EditInteractionTool** | LLM produces a *patch* (only changed fields) given the current form + correction prompt |
| 4 | **SummarizeTool** | LLM condenses voice-note / long text into bullet-point Topics |
| 5 | **SuggestFollowUpsTool** | LLM proposes 3–5 next-step actions based on the full interaction |

Every value the user sees in the form was produced by a Groq tool call.
There is **no regex, no keyword matching, no hardcoded mapping** anywhere.

## Frontend

- **React 18 + Vite + TypeScript** (Redux-equivalent state via React hooks)
- **Tailwind** + semantic design tokens
- **Inter** Google font (per brief)
- Read-only form fields with highlight animation when the agent updates them
- Chat panel showing the agent trace (`router → log → suggest`)

## Backend (live)

- `supabase/functions/agent/index.ts` — Deno edge function calling Groq directly
- `GROQ_API_KEY` stored as a managed secret

## Backend (Python reference — `/backend`)

- `backend/app/main.py` — FastAPI server
- `backend/app/graph.py` — LangGraph `StateGraph` with the 5 nodes above
- `backend/requirements.txt` — `langgraph`, `langchain-groq`, `fastapi`, …
- See `backend/README.md` for run instructions

## Local development

```bash
npm install
npm run dev
```

The live agent uses the project's hosted edge function.
