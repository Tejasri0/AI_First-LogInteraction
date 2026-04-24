import { useState, useRef, useEffect } from "react";
import { Send, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export type ChatMsg = {
  role: "user" | "assistant";
  content: string;
  trace?: string[];
};

type Props = {
  messages: ChatMsg[];
  onSend: (text: string) => void;
  loading: boolean;
};

export default function AgentChat({ messages, onSend, loading }: Props) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const submit = () => {
    const t = input.trim();
    if (!t || loading) return;
    onSend(t);
    setInput("");
  };

  return (
    <div className="bg-[hsl(var(--panel))] border border-[hsl(var(--panel-border))] rounded-xl shadow-sm flex flex-col h-[calc(100vh-8rem)] sticky top-4">
      <div className="px-5 py-4 border-b border-[hsl(var(--panel-border))] flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-[hsl(var(--brand))] flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-[hsl(var(--brand-foreground))]" />
        </div>
        <div>
          <h2 className="text-sm font-semibold leading-tight">AI Assistant</h2>
          <p className="text-xs text-muted-foreground leading-tight">
            LangGraph · llama-3.3-70b
          </p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-sm text-muted-foreground bg-muted/40 rounded-lg p-3">
            Describe an interaction to log it (e.g., <em>"Met Dr. Smith today at 3pm,
            discussed Product X efficacy, positive sentiment, shared brochure"</em>) — or
            ask me to fix any field.
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${
                m.role === "user"
                  ? "bg-[hsl(var(--brand))] text-[hsl(var(--brand-foreground))] rounded-br-sm"
                  : "bg-muted text-foreground rounded-bl-sm"
              }`}
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.trace && m.trace.length > 0 && (
                <div className="mt-1.5 pt-1.5 border-t border-foreground/10 flex flex-wrap gap-1">
                  {m.trace.map((t, j) => (
                    <span
                      key={j}
                      className="text-[10px] uppercase tracking-wide opacity-70"
                    >
                      {j > 0 && "→ "}
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-2xl px-3.5 py-2.5 text-sm flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span className="text-muted-foreground">Routing through agent…</span>
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-[hsl(var(--panel-border))] flex gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Describe interaction or correction…"
          className="resize-none min-h-[44px] max-h-32 text-sm"
          disabled={loading}
        />
        <Button onClick={submit} disabled={loading || !input.trim()} size="icon">
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}