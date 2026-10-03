"use client";

import { useCallback, useEffect, useState } from "react";
import {
  STAGE_LABELS,
  type ProgressStatus,
  type Site,
  type SiteProgress,
  type Stage,
} from "@sparkytalk/shared";
import { api } from "@/lib/api";

const STAGES = Object.keys(STAGE_LABELS) as Stage[];

function Mark({ status, remainingDays }: { status: ProgressStatus; remainingDays: number | null }) {
  if (status === "done") return <span className="st done">✅</span>;
  if (status === "in_progress") {
    return <span className="st doing">⏳{remainingDays ? ` 剩${remainingDays}天` : ""}</span>;
  }
  return <span className="st todo">未开始</span>;
}

/** Room × stage matrix, site work items and recent notes for one site. */
export function SiteProgressView({ site, onChanged }: { site: Site; onChanged: () => void }) {
  const [progress, setProgress] = useState<SiteProgress | null>(null);
  const [newItem, setNewItem] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .siteProgress(site.id)
      .then(setProgress)
      .catch((err: Error) => setError(err.message));
  }, [site.id]);
  useEffect(load, [load]);

  const cell = (roomId: string, stage: Stage) =>
    progress?.rooms.find((r) => r.roomId === roomId && r.stage === stage);

  async function addItem() {
    const name = newItem.trim();
    if (!name) return;
    try {
      await api.addSiteItem(site.id, { name });
      setNewItem("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function removeItem(itemId: string, name: string) {
    if (!confirm(`删除工作项「${name}」？`)) return;
    try {
      await api.deleteSiteItem(site.id, itemId);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="progress">
      {error && <p className="error">{error}</p>}

      {site.levels.some((l) => l.rooms.length) && (
        <div className="matrix-wrap">
          <table className="matrix">
            <thead>
              <tr>
                <th>房间</th>
                {STAGES.map((s) => (
                  <th key={s}>{STAGE_LABELS[s].zh}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {site.levels.map((l) => [
                <tr key={l.id} className="level-row">
                  <td colSpan={STAGES.length + 1}>{l.name}</td>
                </tr>,
                ...l.rooms.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    {STAGES.map((s) => {
                      const c = cell(r.id, s);
                      return (
                        <td key={s}>
                          {c ? <Mark status={c.status} remainingDays={c.remainingDays} /> : <span className="st none">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
      )}

      <h4>工作项</h4>
      <div className="items">
        {site.items.map((i) => (
          <span key={i.id} className="item" title={i.aliases.length ? `也叫：${i.aliases.join("、")}` : undefined}>
            {i.name} <Mark status={i.status} remainingDays={i.remainingDays} />
            <button className="link" aria-label={`删除 ${i.name}`} onClick={() => void removeItem(i.id, i.name)}>
              ×
            </button>
          </span>
        ))}
        <span className="item add">
          <input
            value={newItem}
            placeholder="加一项，如 EV 充电桩"
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addItem();
            }}
          />
        </span>
      </div>

      {progress && progress.notes.length > 0 && (
        <>
          <h4>备注</h4>
          <ul className="notes">
            {progress.notes.map((n) => (
              <li key={n.id}>
                {n.note}{" "}
                <span className="muted">
                  — {n.createdByName} {new Date(n.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
