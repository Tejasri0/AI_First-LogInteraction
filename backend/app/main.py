"""
HCP Interaction Logging — FastAPI + LangGraph + Groq reference backend.
Mirrors the TypeScript edge function in supabase/functions/agent/.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Any
from .graph import run_agent

app = FastAPI(title="HCP CRM Agent")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class AgentRequest(BaseModel):
    prompt: str
    current_form: dict[str, Any] = {}


@app.post("/agent")
async def agent(req: AgentRequest):
    return run_agent(req.prompt, req.current_form)
