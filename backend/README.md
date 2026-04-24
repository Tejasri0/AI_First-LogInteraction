# Python / FastAPI / LangGraph / Groq Reference Backend

This folder is a **reference implementation** of the HCP Interaction Logging agent
using the exact stack required by the task brief:

- **FastAPI** (Python) — HTTP server
- **LangGraph** — agent orchestration with 5 graph nodes (tools)
- **Groq** with `gemma2-9b-it` — LLM
- **MySQL/Postgres** — persistence

The live web app in this repo runs an equivalent agent inside a serverless
edge function (`supabase/functions/agent/index.ts`) so the demo works
out-of-the-box, but the architecture mirrors this Python version 1:1.

## LangGraph — 5 Tools (Nodes)

| # | Node                  | Role                                                                 |
|---|-----------------------|----------------------------------------------------------------------|
| 1 | `RouterTool`          | LLM classifies intent: `log` / `edit` / `summarize` / `suggest` / `chat` |
| 2 | `LogInteractionTool`  | LLM extracts every form field from a free-text description (entity extraction + summarization) |
| 3 | `EditInteractionTool` | LLM produces a *patch* of only the fields the user wants changed     |
| 4 | `SummarizeTool`       | LLM condenses voice-note / long text into 2–3 bullets for the Topics field |
| 5 | `SuggestFollowUpsTool`| LLM proposes 3–5 next-step actions based on the full interaction     |

### Graph topology

```
          ┌─────────────┐
START ──▶ │ RouterTool  │
          └──────┬──────┘
                 │ intent
   ┌─────────────┼──────────────┬──────────────┐
   ▼             ▼              ▼              ▼
LogInteract  EditInteract   Summarize    SuggestFollowUps
   │             │              │              │
   ▼             ▼              ▼              ▼
SuggestFollowUps └────────────► END ◄──────────┘
   │
   ▼
  END
```

**Zero hardcoded form filling** — every field value comes from a Groq tool call.

## Run locally

```bash
pip install -r requirements.txt
export GROQ_API_KEY=gsk_...
export DATABASE_URL=postgresql://user:pass@localhost/hcp_crm
uvicorn app.main:app --reload --port 8000
```

`POST /agent` with body `{"prompt": "...", "current_form": {...}}`.

