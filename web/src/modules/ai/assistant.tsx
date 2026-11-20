"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { PageHeader } from "@/components/ui/kit";

interface AskResult { answer: string; configured: boolean }
interface Turn { question: string; answer: string }

export function AiAssistant() {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const ask = useMutation({
    mutationFn: () => api.post<AskResult>("/ai/assistant/ask", { question }).then((r) => r.data),
    onSuccess: (res) => { setTurns((prev) => [...prev, { question, answer: res.answer }]); setQuestion(""); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader title="AI assistant" subtitle="Ask about your own permission-scoped data — overdue invoices, open leads, expense claims, overdue tasks, or what's waiting for your approval." />
      <div className="space-y-3 mb-4">
        {turns.map((t, i) => (
          <div key={i} className="card p-3">
            <div className="text-sm font-medium text-slate-600 dark:text-slate-300">You: {t.question}</div>
            <div className="text-sm mt-1 whitespace-pre-wrap">{t.answer}</div>
          </div>
        ))}
        {turns.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">No questions yet.</p>}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => { e.preventDefault(); if (question.trim()) ask.mutate(); }}
      >
        <input className="input-base flex-1" placeholder="e.g. What invoices are overdue?" value={question} onChange={(e) => setQuestion(e.target.value)} />
        <button className="btn-primary" type="submit" disabled={ask.isPending || !question.trim()}><Sparkles size={14} /> Ask</button>
      </form>
    </div>
  );
}
