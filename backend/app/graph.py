"""
LangGraph definition with 5 nodes, all powered by Groq gemma2-9b-it.
No deterministic form filling — every value is produced by an LLM tool call.
"""
import os
import json
from datetime import date
from typing import TypedDict, Literal, Any
from langgraph.graph import StateGraph, START, END
from langchain_groq import ChatGroq
from langchain_core.messages import SystemMessage, HumanMessage

GROQ_MODEL = "gemma2-9b-it"
llm = ChatGroq(model=GROQ_MODEL, temperature=0.2, api_key=os.environ["GROQ_API_KEY"])


class AgentState(TypedDict, total=False):
    user_prompt: str
    current_form: dict
    intent: Literal["log", "edit", "summarize", "suggest", "chat"]
    extracted: dict
    edits: dict
    suggestions: list[str]
    reply: str
    trace: list[str]


# ---------- helpers ----------
def _tool_call(system: str, user: str, schema: dict, name: str) -> dict:
    """Force-call a function tool and return parsed JSON args."""
    bound = llm.bind_tools([{"type": "function", "function": {"name": name, "parameters": schema}}],
                           tool_choice={"type": "function", "function": {"name": name}})
    msg = bound.invoke([SystemMessage(content=system), HumanMessage(content=user)])
    if msg.tool_calls:
        return msg.tool_calls[0]["args"]
    try:
        return json.loads(msg.content)
    except Exception:
        return {}


# ---------- 1. Router ----------
def router_node(state: AgentState) -> AgentState:
    state.setdefault("trace", []).append("router")
    has_form = any(v for v in state["current_form"].values())
    schema = {
        "type": "object",
        "properties": {"intent": {"type": "string", "enum": ["log", "edit", "summarize", "suggest", "chat"]}},
        "required": ["intent"],
    }
    sys = f"Form is {'POPULATED' if has_form else 'EMPTY'}. Classify the user intent."
    args = _tool_call(sys, state["user_prompt"], schema, "classify_intent")
    state["intent"] = args.get("intent", "chat")
    return state


# ---------- 2. Log ----------
LOG_SCHEMA = {
    "type": "object",
    "properties": {
        "hcp_name": {"type": "string"},
        "interaction_type": {"type": "string", "enum": ["Meeting", "Call", "Email", "Conference", "Sample Drop", "Other"]},
        "date": {"type": "string"},
        "time": {"type": "string"},
        "attendees": {"type": "string"},
        "topics_discussed": {"type": "string"},
        "materials_shared": {"type": "array", "items": {"type": "string"}},
        "samples_distributed": {
            "type": "array",
            "items": {"type": "object", "properties": {"name": {"type": "string"}, "quantity": {"type": "number"}}, "required": ["name"]},
        },
        "sentiment": {"type": "string", "enum": ["Positive", "Neutral", "Negative"]},
        "outcomes": {"type": "string"},
        "follow_up_actions": {"type": "string"},
    },
}


def log_node(state: AgentState) -> AgentState:
    state["trace"].append("log_interaction")
    sys = f"Extract HCP interaction fields. Use today {date.today()} if no date given. Do not invent facts."
    state["extracted"] = _tool_call(sys, state["user_prompt"], LOG_SCHEMA, "fill_interaction_form")
    return state


# ---------- 3. Edit ----------
def edit_node(state: AgentState) -> AgentState:
    state["trace"].append("edit_interaction")
    sys = (
        "Patch the form. Return ONLY fields that change.\n"
        f"CURRENT FORM:\n{json.dumps(state['current_form'], indent=2)}"
    )
    schema = {**LOG_SCHEMA, "properties": {**LOG_SCHEMA["properties"], "_explanation": {"type": "string"}}}
    args = _tool_call(sys, state["user_prompt"], schema, "patch_interaction_form")
    state["reply"] = args.pop("_explanation", "Updated requested fields.")
    state["edits"] = args
    return state


# ---------- 4. Summarize ----------
def summarize_node(state: AgentState) -> AgentState:
    state["trace"].append("summarize")
    msg = llm.invoke([
        SystemMessage(content="Summarize HCP notes into 2-3 crisp bullets."),
        HumanMessage(content=state["user_prompt"]),
    ])
    state["reply"] = msg.content
    return state


# ---------- 5. Suggest follow-ups ----------
def suggest_node(state: AgentState) -> AgentState:
    state["trace"].append("suggest_follow_ups")
    merged = {**state["current_form"], **state.get("extracted", {}), **state.get("edits", {})}
    schema = {"type": "object", "properties": {"suggestions": {"type": "array", "items": {"type": "string"}}}, "required": ["suggestions"]}
    sys = "Suggest 3-5 concise follow-up actions for a pharma field rep."
    args = _tool_call(sys, f"Interaction:\n{json.dumps(merged, indent=2)}\nContext: {state['user_prompt']}", schema, "suggest_follow_ups")
    state["suggestions"] = args.get("suggestions", [])
    return state


# ---------- Graph wiring ----------
def _route(state: AgentState) -> str:
    return state["intent"]


def build_graph():
    g = StateGraph(AgentState)
    g.add_node("router", router_node)
    g.add_node("log", log_node)
    g.add_node("edit", edit_node)
    g.add_node("summarize", summarize_node)
    g.add_node("suggest", suggest_node)

    g.add_edge(START, "router")
    g.add_conditional_edges("router", _route, {
        "log": "log", "edit": "edit", "summarize": "summarize",
        "suggest": "suggest", "chat": "summarize",
    })
    g.add_edge("log", "suggest")  # log chains into suggest
    g.add_edge("edit", END)
    g.add_edge("summarize", END)
    g.add_edge("suggest", END)
    return g.compile()


GRAPH = build_graph()


def run_agent(prompt: str, current_form: dict) -> dict:
    final = GRAPH.invoke({"user_prompt": prompt, "current_form": current_form, "trace": []})
    return {
        "intent": final.get("intent"),
        "extracted": final.get("extracted"),
        "edits": final.get("edits"),
        "suggestions": final.get("suggestions", []),
        "reply": final.get("reply"),
        "trace": final.get("trace", []),
    }
