"use client";

import { useCallback, useEffect, useState } from "react";
import { NZ_TIME_ZONE, nzDate, type PlanRow, type VisitRow } from "@sparkytalk/shared";
import { CommandBox } from "@/components/CommandBox";
import { api } from "@/lib/api";

const VISIT_LABEL: Record<VisitRow["type"], string> = {
  enter: "到场",
  exit: "离场",
  manual_checkin: "打卡到场",
  manual_checkout: "打卡离场",
};

function time(at: string) {
  return new Date(at).toLocaleTimeString("en-NZ", {
    timeZone: NZ_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Plan vs actual for every worker on one day (CLAUDE.md §6). */
export default function BoardPage() {
  const [date, setDate] = useState(nzDate());
  const [data, setData] = useState<{ plan: PlanRow[]; visits: VisitRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .board(date)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err: Error) => setError(err.message));
  }, [date]);
  useEffect(load, [load]);

  const people = new Map<string, { name: string; plan: PlanRow[]; visits: VisitRow[] }>();
  for (const p of data?.plan ?? []) {
    const entry = people.get(p.employeeId) ?? { name: p.employeeName, plan: [], visits: [] };
    entry.plan.push(p);
    people.set(p.employeeId, entry);
  }
  for (const v of data?.visits ?? []) {
    const entry = people.get(v.employeeId) ?? { name: "（无计划）", plan: [], visits: [] };
    entry.visits.push(v);
    people.set(v.employeeId, entry);
  }

  return (
    <>
      <CommandBox onApplied={load} />
      <section className="card">
        <div className="row">
          <h2>计划 vs 实际</h2>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        {error && <p className="error">{error}</p>}
        {data && people.size === 0 && <p className="muted">这一天还没有安排。</p>}
        <div className="board">
          {[...people.entries()].map(([id, person]) => {
            const plannedSites = new Set(
              person.plan.filter((p) => p.status === "planned").map((p) => p.siteId),
            );
            return (
              <article key={id} className="person">
                <h3>{person.name}</h3>
                <h4>计划</h4>
                <ul>
                  {person.plan.map((p) => (
                    <li key={p.id} className={p.status !== "planned" ? "struck" : undefined}>
                      {p.siteName} · {p.jobTitle}
                      {p.notes ? ` · ${p.notes}` : ""}
                      {p.status === "moved" && " （已改）"}
                    </li>
                  ))}
                </ul>
                <h4>实际</h4>
                <ul>
                  {person.visits.length === 0 && <li className="muted">暂无到场记录</li>}
                  {person.visits.map((v, i) => (
                    <li key={i} className={plannedSites.has(v.siteId) ? undefined : "deviation"}>
                      {time(v.at)} {VISIT_LABEL[v.type]} {v.siteName}
                      {!plannedSites.has(v.siteId) && " · 计划外"}
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}
