export type Sample = { name: string; quantity?: number };

export type InteractionForm = {
  hcp_name: string;
  interaction_type: string;
  date: string;
  time: string;
  attendees: string;
  topics_discussed: string;
  materials_shared: string[];
  samples_distributed: Sample[];
  sentiment: "" | "Positive" | "Neutral" | "Negative";
  outcomes: string;
  follow_up_actions: string;
};

export const emptyForm: InteractionForm = {
  hcp_name: "",
  interaction_type: "",
  date: "",
  time: "",
  attendees: "",
  topics_discussed: "",
  materials_shared: [],
  samples_distributed: [],
  sentiment: "",
  outcomes: "",
  follow_up_actions: "",
};

export type AgentResponse = {
  intent: "log" | "edit" | "summarize" | "suggest" | "chat";
  extracted: Partial<InteractionForm> | null;
  edits: Partial<InteractionForm> | null;
  suggestions: string[];
  reply: string | null;
  trace: string[];
};