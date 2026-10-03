"use client";

import { useCallback, useEffect, useState } from "react";
import type { Site } from "@sparkytalk/shared";
import { BlueprintUpload } from "@/components/BlueprintUpload";
import { SiteProgressView } from "@/components/SiteProgressView";
import { api } from "@/lib/api";

const SOURCE_LABEL: Record<NonNullable<Site["locationSource"]>, string> = {
  geocode: "地址定位",
  parcel: "地块边界",
  pin: "手动拖针",
  onsite: "现场设定",
  learned: "自动学习",
};

export default function SitesPage() {
  const [sites, setSites] = useState<Site[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    api
      .sites()
      .then(setSites)
      .catch((err: Error) => setError(err.message));
  }, []);
  useEffect(load, [load]);

  return (
    <>
      <BlueprintUpload onCreated={load} />
      <section className="card">
        <h2>工地</h2>
        {error && <p className="error">{error}</p>}
        {sites?.length === 0 && <p className="muted">还没有工地。</p>}
        {sites?.map((s) => (
          <article key={s.id} className="site">
            <h3>{s.displayName}</h3>
            <p className="muted">
              {[s.officialAddress, s.legalDescription, s.floorAreaM2 && `${s.floorAreaM2} m²`]
                .filter(Boolean)
                .join(" · ")}
              {" · "}
              {s.locationSource ? `位置：${SOURCE_LABEL[s.locationSource]}` : "位置未设定（首次到场时设定）"}
            </p>
            <SiteProgressView site={s} onChanged={load} />
          </article>
        ))}
      </section>
    </>
  );
}
