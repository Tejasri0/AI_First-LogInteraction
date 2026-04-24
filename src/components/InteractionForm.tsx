import type { InteractionForm as TForm } from "@/types/interaction";
import { Smile, Meh, Frown } from "lucide-react";

type Props = { form: TForm; highlight: Set<string> };

const Field = ({
  label,
  highlighted,
  children,
}: {
  label: string;
  highlighted?: boolean;
  children: React.ReactNode;
}) => (
  <div className="space-y-1.5">
    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
      {label}
    </label>
    <div
      className={`min-h-[40px] rounded-md border bg-background px-3 py-2 text-sm transition-all ${
        highlighted
          ? "border-[hsl(var(--brand))] ring-2 ring-[hsl(var(--brand))]/20 bg-[hsl(var(--brand))]/5"
          : "border-input"
      }`}
    >
      {children}
    </div>
  </div>
);

export default function InteractionFormView({ form, highlight }: Props) {
  const empty = <span className="text-muted-foreground/60 italic">—</span>;

  return (
    <div className="bg-[hsl(var(--panel))] border border-[hsl(var(--panel-border))] rounded-xl p-6 shadow-sm space-y-5">
      <h2 className="text-lg font-semibold">Interaction Details</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="HCP Name" highlighted={highlight.has("hcp_name")}>
          {form.hcp_name || empty}
        </Field>
        <Field label="Interaction Type" highlighted={highlight.has("interaction_type")}>
          {form.interaction_type || empty}
        </Field>
        <Field label="Date" highlighted={highlight.has("date")}>
          {form.date || empty}
        </Field>
        <Field label="Time" highlighted={highlight.has("time")}>
          {form.time || empty}
        </Field>
      </div>

      <Field label="Attendees" highlighted={highlight.has("attendees")}>
        {form.attendees || empty}
      </Field>

      <Field label="Topics Discussed" highlighted={highlight.has("topics_discussed")}>
        {form.topics_discussed ? (
          <p className="whitespace-pre-wrap">{form.topics_discussed}</p>
        ) : (
          empty
        )}
      </Field>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Materials Shared" highlighted={highlight.has("materials_shared")}>
          {form.materials_shared.length ? (
            <ul className="space-y-0.5">
              {form.materials_shared.map((m, i) => (
                <li key={i}>• {m}</li>
              ))}
            </ul>
          ) : (
            empty
          )}
        </Field>
        <Field label="Samples Distributed" highlighted={highlight.has("samples_distributed")}>
          {form.samples_distributed.length ? (
            <ul className="space-y-0.5">
              {form.samples_distributed.map((s, i) => (
                <li key={i}>
                  • {s.name}
                  {s.quantity ? ` × ${s.quantity}` : ""}
                </li>
              ))}
            </ul>
          ) : (
            empty
          )}
        </Field>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Observed/Inferred HCP Sentiment
        </label>
        <div
          className={`mt-1.5 flex gap-3 rounded-md border bg-background px-3 py-2 transition-all ${
            highlight.has("sentiment")
              ? "border-[hsl(var(--brand))] ring-2 ring-[hsl(var(--brand))]/20"
              : "border-input"
          }`}
        >
          {[
            { v: "Positive", icon: Smile, color: "var(--positive)" },
            { v: "Neutral", icon: Meh, color: "var(--neutral)" },
            { v: "Negative", icon: Frown, color: "var(--negative)" },
          ].map(({ v, icon: Icon, color }) => {
            const active = form.sentiment === v;
            return (
              <div
                key={v}
                className={`flex items-center gap-1.5 px-2 py-1 rounded text-sm ${
                  active ? "font-semibold" : "text-muted-foreground"
                }`}
                style={active ? { color: `hsl(${color})` } : {}}
              >
                <Icon className="w-4 h-4" />
                {v}
              </div>
            );
          })}
        </div>
      </div>

      <Field label="Outcomes" highlighted={highlight.has("outcomes")}>
        {form.outcomes ? <p className="whitespace-pre-wrap">{form.outcomes}</p> : empty}
      </Field>

      <Field label="Follow-up Actions" highlighted={highlight.has("follow_up_actions")}>
        {form.follow_up_actions ? (
          <p className="whitespace-pre-wrap">{form.follow_up_actions}</p>
        ) : (
          empty
        )}
      </Field>
    </div>
  );
}