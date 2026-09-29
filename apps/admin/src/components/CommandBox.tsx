"use client";

import { useState } from "react";
import { describeAction, type CommandProposal } from "@sparkytalk/shared";
import { api } from "@/lib/api";


/**
 * Type (or later, speak) an instruction → AI proposal → confirm.
 * Nothing is saved until the user presses 确认.
 */
export function CommandBox({ onApplied }: { onApplied?: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<CommandProposal | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run<T>(fn: () => Promise<T>) {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>一句话安排</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) void run(async () => setProposal(await api.command(text.trim())));
        }}
      >
        <textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="例如：帮我给小张明天安排 151 coast rd 拉线的活"
        />
        <button type="submit" disabled={busy || !text.trim()}>
          {busy && !proposal ? "解析中…" : "解析"}
        </button>
      </form>

      {proposal && (
        <div className="proposal">
          <p className="summary">{proposal.summary}</p>
          <ul>
            {proposal.actions.map((a, i) => (
              <li key={i}>
                {describeAction(a)}
                {proposal.issues
                  .filter((issue) => issue.index === i)
                  .map((issue) => (
                    <span key={issue.problem} className="issue">
                      {issue.problem}
                    </span>
                  ))}
              </li>
            ))}
          </ul>
          <div className="row">
            <button
              disabled={busy || proposal.issues.length > 0}
              onClick={() =>
                void run(async () => {
                  await api.confirmCommand(proposal.proposalId);
                  setProposal(null);
                  setText("");
                  onApplied?.();
                })
              }
            >
              确认
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api.reject(proposal.proposalId);
                  setProposal(null);
                })
              }
            >
              取消
            </button>
          </div>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
