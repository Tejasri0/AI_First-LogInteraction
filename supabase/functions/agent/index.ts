// LangGraph-style multi-node agent for HCP Interaction Logging.
// 5 graph nodes (tools) — all decisions and field-extraction handled by Groq LLM.
// No hardcoded form filling. The LLM interprets the natural-language prompt and
// returns structured field updates via tool-calling.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
const MODEL = "llama-3.3-70b-versatile";

// ---------- Schema (single source of truth) ----------
const FORM_SCHEMA = {
  hcp_name: "string — Healthcare Professional name",
  interaction_type: "Meeting | Call | Email | Conference | Sample Drop | Other",
  date: "ISO date YYYY-MM-DD",
  time: "HH:MM (24h)",
  attendees: "comma-separated names",
  topics_discussed: "free text — key discussion points",
  materials_shared: "array of strings (brochures, decks, PDFs)",
  samples_distributed: "array of {name, quantity}",
  sentiment: "Positive | Neutral | Negative",
  outcomes: "free text — agreements / decisions",
  follow_up_actions: "free text — next steps",
};

// ---------- Graph state ----------
type GraphState = {
  user_prompt: string;
  current_form: Record<string, unknown>;
  intent?: "log" | "edit" | "summarize" | "suggest" | "chat";
  extracted?: Record<string, unknown>;
  edits?: Record<string, unknown>;
  suggestions?: string[];
  reply?: string;
  trace: string[];
};

// ---------- Groq helper ----------
async function groq(messages: any[], tools?: any[], tool_choice?: any) {
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not configured");
  const body: any = {
    model: MODEL,
    messages,
    temperature: 0.2,
  };
  if (tools) body.tools = tools;
  if (tool_choice) body.tool_choice = tool_choice;

  const r = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Groq ${r.status}: ${t}`);
  }
  return await r.json();
}

function parseToolArgs(resp: any): any {
  const call = resp?.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) {
    const content = resp?.choices?.[0]?.message?.content ?? "";
    try { return JSON.parse(content); } catch { return { _raw: content }; }
  }
  try { return JSON.parse(call.function.arguments); }
  catch { return {}; }
}

// =====================================================
// NODE 1 — RouterTool: classify user intent
// =====================================================
async function nodeRouter(state: GraphState): Promise<GraphState> {
  state.trace.push("router");
  const tools = [{
    type: "function",
    function: {
      name: "classify_intent",
      description: "Classify what the user wants to do with the HCP interaction form.",
      parameters: {
        type: "object",
        properties: {
          intent: {
            type: "string",
            enum: ["log", "edit", "summarize", "suggest", "chat"],
            description: "log = first-time fill, edit = modify existing fields, summarize = produce summary, suggest = follow-ups, chat = general help",
          },
          reasoning: { type: "string" },
        },
        required: ["intent"],
      },
    },
  }];

  const hasForm = Object.values(state.current_form).some(
    (v) => v !== "" && v !== null && !(Array.isArray(v) && v.length === 0),
  );

  const sys = `You route user requests for an HCP CRM agent.
Decide the intent. If the form already has data and the user describes a correction, that's "edit".
If the form is mostly empty and the user describes an interaction, that's "log".
Form is ${hasForm ? "ALREADY POPULATED" : "EMPTY"}.`;

  const resp = await groq(
    [
      { role: "system", content: sys },
      { role: "user", content: state.user_prompt },
    ],
    tools,
    { type: "function", function: { name: "classify_intent" } },
  );
  const args = parseToolArgs(resp);
  state.intent = args.intent ?? "chat";
  return state;
}

// =====================================================
// NODE 2 — LogInteractionTool: extract full form from prompt
// =====================================================
async function nodeLogInteraction(state: GraphState): Promise<GraphState> {
  state.trace.push("log_interaction");
  const today = new Date().toISOString().slice(0, 10);
  const tools = [{
    type: "function",
    function: {
      name: "fill_interaction_form",
      description: "Extract structured HCP interaction fields from the user's natural-language description.",
      parameters: {
        type: "object",
        properties: {
          hcp_name: { type: "string" },
          interaction_type: { type: "string", enum: ["Meeting", "Call", "Email", "Conference", "Sample Drop", "Other"] },
          date: { type: "string", description: "YYYY-MM-DD" },
          time: { type: "string", description: "HH:MM 24h" },
          attendees: { type: "string" },
          topics_discussed: { type: "string" },
          materials_shared: { type: "array", items: { type: "string" } },
          samples_distributed: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                quantity: { type: "number" },
              },
              required: ["name"],
            },
          },
          sentiment: { type: "string", enum: ["Positive", "Neutral", "Negative"] },
          outcomes: { type: "string" },
          follow_up_actions: { type: "string" },
        },
      },
    },
  }];

  const sys = `You are an HCP interaction logging assistant for life-science field reps.
Extract every field you can infer from the user's prompt. Do not invent facts that aren't there.
If the user does not specify a date, use today: ${today}.
If sentiment is unclear, infer from tone (enthusiastic→Positive, hesitant→Neutral, dismissive→Negative).
Schema reference:\n${JSON.stringify(FORM_SCHEMA, null, 2)}`;

  const resp = await groq(
    [
      { role: "system", content: sys },
      { role: "user", content: state.user_prompt },
    ],
    tools,
    { type: "function", function: { name: "fill_interaction_form" } },
  );
  state.extracted = parseToolArgs(resp);
  return state;
}

// =====================================================
// NODE 3 — EditInteractionTool: produce a partial patch
// =====================================================
async function nodeEditInteraction(state: GraphState): Promise<GraphState> {
  state.trace.push("edit_interaction");
  const tools = [{
    type: "function",
    function: {
      name: "patch_interaction_form",
      description: "Return ONLY the fields that should change. Omit unchanged fields.",
      parameters: {
        type: "object",
        properties: {
          hcp_name: { type: "string" },
          interaction_type: { type: "string", enum: ["Meeting", "Call", "Email", "Conference", "Sample Drop", "Other"] },
          date: { type: "string" },
          time: { type: "string" },
          attendees: { type: "string" },
          topics_discussed: { type: "string" },
          materials_shared: { type: "array", items: { type: "string" } },
          samples_distributed: {
            type: "array",
            items: {
              type: "object",
              properties: { name: { type: "string" }, quantity: { type: "number" } },
              required: ["name"],
            },
          },
          sentiment: { type: "string", enum: ["Positive", "Neutral", "Negative"] },
          outcomes: { type: "string" },
          follow_up_actions: { type: "string" },
          _explanation: { type: "string", description: "1 short sentence describing the change" },
        },
      },
    },
  }];

  const sys = `You edit an existing HCP interaction form based on the user's correction.
CURRENT FORM:\n${JSON.stringify(state.current_form, null, 2)}
Return ONLY the fields that need to change. Be precise. Do not echo unchanged fields.`;

  const resp = await groq(
    [
      { role: "system", content: sys },
      { role: "user", content: state.user_prompt },
    ],
    tools,
    { type: "function", function: { name: "patch_interaction_form" } },
  );
  const args = parseToolArgs(resp);
  const explanation = args._explanation;
  delete args._explanation;
  state.edits = args;
  state.reply = explanation ?? "Updated the requested fields.";
  return state;
}

// =====================================================
// NODE 4 — SummarizeTool: voice-note / topic summarization
// =====================================================
async function nodeSummarize(state: GraphState): Promise<GraphState> {
  state.trace.push("summarize");
  const resp = await groq([
    { role: "system", content: "You summarize HCP interaction notes into 2-3 crisp bullet points suitable for a CRM topics field." },
    { role: "user", content: state.user_prompt },
  ]);
  state.reply = resp?.choices?.[0]?.message?.content ?? "";
  return state;
}

// =====================================================
// NODE 5 — SuggestFollowUpsTool: AI-suggested next actions
// =====================================================
async function nodeSuggestFollowUps(state: GraphState): Promise<GraphState> {
  state.trace.push("suggest_follow_ups");
  const tools = [{
    type: "function",
    function: {
      name: "suggest_follow_ups",
      description: "Return 3-5 short follow-up actions for this HCP interaction.",
      parameters: {
        type: "object",
        properties: {
          suggestions: { type: "array", items: { type: "string" } },
        },
        required: ["suggestions"],
      },
    },
  }];
  const merged = { ...state.current_form, ...(state.extracted ?? {}), ...(state.edits ?? {}) };
  const resp = await groq(
    [
      { role: "system", content: "You suggest concise, actionable follow-ups for a pharma field rep based on an HCP interaction." },
      { role: "user", content: `Interaction:\n${JSON.stringify(merged, null, 2)}\n\nUser context: ${state.user_prompt}` },
    ],
    tools,
    { type: "function", function: { name: "suggest_follow_ups" } },
  );
  const args = parseToolArgs(resp);
  state.suggestions = args.suggestions ?? [];
  return state;
}

// =====================================================
// Graph orchestrator
// =====================================================
async function runGraph(state: GraphState) {
  // Edge: START -> router
  await nodeRouter(state);

  // Conditional edges from router
  if (state.intent === "log") {
    await nodeLogInteraction(state);
    await nodeSuggestFollowUps(state); // chained
  } else if (state.intent === "edit") {
    await nodeEditInteraction(state);
  } else if (state.intent === "summarize") {
    await nodeSummarize(state);
  } else if (state.intent === "suggest") {
    await nodeSuggestFollowUps(state);
  } else {
    // chat fallback uses summarize node as a generic responder
    await nodeSummarize(state);
  }
  return state;
}

// =====================================================
// HTTP entrypoint
// =====================================================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, current_form } = await req.json();
    if (!prompt || typeof prompt !== "string") {
      return new Response(JSON.stringify({ error: "prompt is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const state: GraphState = {
      user_prompt: prompt,
      current_form: current_form ?? {},
      trace: [],
    };

    const result = await runGraph(state);

    return new Response(
      JSON.stringify({
        intent: result.intent,
        extracted: result.extracted ?? null,
        edits: result.edits ?? null,
        suggestions: result.suggestions ?? [],
        reply: result.reply ?? null,
        trace: result.trace,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("agent error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});