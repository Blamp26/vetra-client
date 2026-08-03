import { useMemo, useState } from "react";

export interface PollCreationPayload {
  question: string;
  description?: string | null;
  options: string[];
  settings: Record<string, boolean | string | null>;
  correct_positions: number[];
  duration?: string;
  closes_at?: string;
  mediaFileId?: string | null;
  mediaFileIds?: string[] | null;
}

export function PollComposer({
  pending = false,
  error,
  onSubmit,
  onCancel,
}: {
  pending?: boolean;
  error?: string | null;
  onSubmit: (payload: PollCreationPayload) => Promise<void> | void;
  onCancel: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [description, setDescription] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [settings, setSettings] = useState({
    show_voters: false,
    multiple_answers: false,
    allow_adding_options: false,
    allow_revoting: false,
    shuffle_options: false,
    hide_results: false,
    correct_answer_mode: false,
  });
  const [correct, setCorrect] = useState<number[]>([]);
  const [explanation, setExplanation] = useState("");
  const [duration, setDuration] = useState("");
  const [customDeadline, setCustomDeadline] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const canSubmit = useMemo(
    () => question.trim().length > 0 && options.length >= 2 && options.every((option) => option.trim()),
    [options, question],
  );

  const updateSetting = (key: keyof typeof settings, value: boolean) => {
    setSettings((current) => ({
      ...current,
      [key]: value,
      ...(key === "correct_answer_mode" && value
        ? { allow_adding_options: false, allow_revoting: false }
        : {}),
    }));
    if (key === "correct_answer_mode" && !value) {
      setCorrect([]);
      setExplanation("");
    }
  };

  const submit = async () => {
    const normalized = options.map((option) => option.trim());
    if (!question.trim() || normalized.some((option) => !option)) {
      setLocalError("Enter a question and every option.");
      return;
    }
    if (new Set(normalized).size !== normalized.length) {
      setLocalError("Options must be distinct.");
      return;
    }
    if (settings.correct_answer_mode && correct.length === 0) {
      setLocalError("Select at least one correct answer.");
      return;
    }
    if (duration === "custom" && !customDeadline) {
      setLocalError("Choose a custom deadline.");
      return;
    }
    setLocalError(null);
    await onSubmit({
      question: question.trim(),
      description: description.trim() || null,
      options: normalized,
      settings: { ...settings, ...(settings.correct_answer_mode && explanation.trim() ? { explanation: explanation.trim() } : {}) },
      correct_positions: correct,
      ...(duration ? { duration } : {}),
      ...(duration === "custom" && customDeadline ? { closes_at: new Date(customDeadline).toISOString() } : {}),
    });
  };

  return (
    <section aria-label="Create poll" data-testid="poll-composer" className="space-y-2 border-t border-border p-3">
      <input aria-label="Poll question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Question" maxLength={300} autoFocus />
      <textarea aria-label="Poll description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description (optional)" maxLength={2000} />
      <div className="space-y-1">
        {options.map((option, index) => (
          <div className="flex gap-1" key={`poll-option-${index}`}>
            {settings.correct_answer_mode && <input aria-label={`Correct option ${index + 1}`} type="checkbox" checked={correct.includes(index)} onChange={() => setCorrect((current) => current.includes(index) ? current.filter((value) => value !== index) : [...current, index])} />}
            <input aria-label={`Poll option ${index + 1}`} value={option} onChange={(event) => setOptions((current) => current.map((value, item) => item === index ? event.target.value : value))} placeholder={`Option ${index + 1}`} maxLength={200} />
            <button type="button" aria-label={`Remove option ${index + 1}`} disabled={options.length <= 2} onClick={() => { setOptions((current) => current.filter((_, item) => item !== index)); setCorrect((current) => current.filter((value) => value !== index).map((value) => value > index ? value - 1 : value)); }}>Remove</button>
            <button type="button" aria-label={`Move option ${index + 1} up`} disabled={index === 0} onClick={() => { setOptions((current) => { const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; }); setCorrect((current) => current.map((value) => value === index ? index - 1 : value === index - 1 ? index : value)); }}>↑</button>
            <button type="button" aria-label={`Move option ${index + 1} down`} disabled={index === options.length - 1} onClick={() => { setOptions((current) => { const next = [...current]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; return next; }); setCorrect((current) => current.map((value) => value === index ? index + 1 : value === index + 1 ? index : value)); }}>↓</button>
          </div>
        ))}
        <button type="button" disabled={options.length >= 12} onClick={() => setOptions((current) => [...current, ""])}>Add option</button>
      </div>
      <div className="grid grid-cols-2 gap-1 text-sm">
        {(["show_voters", "multiple_answers", "allow_adding_options", "allow_revoting", "shuffle_options", "hide_results"] as const).map((key) => (
          <label key={key}><input type="checkbox" checked={settings[key]} disabled={settings.correct_answer_mode && (key === "allow_adding_options" || key === "allow_revoting")} onChange={(event) => updateSetting(key, event.target.checked)} /> {key.replace(/_/g, " ")}</label>
        ))}
        <label><input type="checkbox" checked={settings.correct_answer_mode} onChange={(event) => updateSetting("correct_answer_mode", event.target.checked)} /> correct answers</label>
      </div>
      {settings.correct_answer_mode && <input aria-label="Wrong answer explanation" value={explanation} onChange={(event) => setExplanation(event.target.value)} placeholder="Explanation after a wrong answer (optional)" maxLength={2000} />}
      <select aria-label="Poll duration" value={duration} onChange={(event) => setDuration(event.target.value)}>
        <option value="">No deadline</option><option value="1h">1 hour</option><option value="3h">3 hours</option><option value="8h">8 hours</option><option value="1d">1 day</option><option value="3d">3 days</option><option value="custom">Custom deadline</option>
      </select>
      {duration === "custom" && <input aria-label="Custom poll deadline" type="datetime-local" value={customDeadline} onChange={(event) => setCustomDeadline(event.target.value)} />}
      {(localError || error) && <p role="alert">{localError || error}</p>}
      <div className="flex gap-2"><button type="button" onClick={onCancel} disabled={pending}>Cancel</button><button type="button" onClick={() => void submit()} disabled={!canSubmit || pending}>{pending ? "Creating…" : "Create poll"}</button></div>
    </section>
  );
}
