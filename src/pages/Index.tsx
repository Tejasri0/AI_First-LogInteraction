import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import InteractionFormView from "@/components/InteractionForm";
import AgentChat, { type ChatMsg } from "@/components/AgentChat";
import { emptyForm, type InteractionForm, type AgentResponse } from "@/types/interaction";
import { Activity } from "lucide-react";

export default function Index() {
  const [form, setForm] = useState<InteractionForm>(emptyForm);
  const [highlight, setHighlight] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const flashHighlight = (keys: string[]) => {
    setHighlight(new Set(keys));
    setTimeout(() => setHighlight(new Set()), 2500);
  };

  const mergePatch = (patch: Partial<InteractionForm>) => {
    const changed: string[] = [];
    setForm((prev) => {
      const next = { ...prev };
      (Object.keys(patch) as (keyof InteractionForm)[]).forEach((k) => {
        const v = patch[k];
        if (v === undefined || v === null) return;
        // @ts-expect-error dynamic
        next[k] = v;
        changed.push(k as string);
      });
      return next;
    });
    flashHighlight(changed);
    return changed;
  };

  const sendPrompt = async (text: string) => {
    setMessages((m) => [...m, { role: "user", content: text }]);
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke<AgentResponse>("agent", {
        body: { prompt: text, current_form: form },
      });
      if (error) throw error;
      if (!data) throw new Error("Empty response");

      let assistantText = "";
      let changed: string[] = [];

      if (data.intent === "log" && data.extracted) {
        changed = mergePatch(data.extracted);
        assistantText = `Logged interaction. Filled ${changed.length} field${changed.length === 1 ? "" : "s"}.`;
      } else if (data.intent === "edit" && data.edits) {
        changed = mergePatch(data.edits);
        assistantText = data.reply ?? `Updated ${changed.length} field${changed.length === 1 ? "" : "s"}.`;
      } else {
        assistantText = data.reply ?? "Done.";
      }

      if (data.suggestions && data.suggestions.length) {
        setSuggestions(data.suggestions);
      }

      setMessages((m) => [
        ...m,
        { role: "assistant", content: assistantText, trace: data.trace },
      ]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Agent error";
      toast.error(msg);
      setMessages((m) => [...m, { role: "assistant", content: `⚠️ ${msg}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-[hsl(var(--panel))] border-b border-[hsl(var(--panel-border))]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[hsl(var(--brand))] flex items-center justify-center">
            <Activity className="w-5 h-5 text-[hsl(var(--brand-foreground))]" />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Log HCP Interaction</h1>
            <p className="text-xs text-muted-foreground leading-tight">
              AI-First CRM · LangGraph agent · No manual entry
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
        <div className="space-y-4">
          <InteractionFormView form={form} highlight={highlight} />

          {suggestions.length > 0 && (
            <div className="bg-[hsl(var(--panel))] border border-[hsl(var(--panel-border))] rounded-xl p-5 shadow-sm">
              <h3 className="text-sm font-semibold mb-2 text-[hsl(var(--brand))]">
                AI Suggested Follow-ups
              </h3>
              <ul className="space-y-1.5 text-sm">
                {suggestions.map((s, i) => (
                  <li key={i} className="text-[hsl(var(--brand))] hover:underline cursor-pointer">
                    + {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <AgentChat messages={messages} onSend={sendPrompt} loading={loading} />
      </main>
    </div>
  );
}
