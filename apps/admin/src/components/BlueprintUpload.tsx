"use client";

import { useState } from "react";
import type { BlueprintProposal } from "@sparkytalk/shared";
import { api } from "@/lib/api";

/** Level/rooms edited as text: one level per line, "Ground: Kitchen, Lounge, Bed 1". */
function levelsToText(levels: BlueprintProposal["levels"]) {
  return levels.map((l) => `${l.name}: ${l.rooms.join(", ")}`).join("\n");
}

function textToLevels(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = "", rooms = ""] = line.split(/:(.*)/s);
      return {
        name: name.trim(),
        rooms: rooms
          .split(",")
          .map((r) => r.trim())
          .filter(Boolean),
      };
    })
    .filter((l) => l.name);
}

/** Drop a plan PDF → AI extraction → owner reviews/edits → site created. */
export function BlueprintUpload({ onCreated }: { onCreated: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<BlueprintProposal | null>(null);
  const [form, setForm] = useState({ displayName: "", address: "", legal: "", area: "", levels: "" });

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const p = await api.uploadBlueprint(file, file.name);
      setProposal(p);
      setForm({
        displayName: p.address ?? p.legalDescription ?? file.name.replace(/\.pdf$/i, ""),
        address: p.address ?? "",
        legal: p.legalDescription ?? "",
        area: p.floorAreaM2?.toString() ?? "",
        levels: levelsToText(p.levels),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!proposal) return;
    setBusy(true);
    setError(null);
    try {
      const area = Number(form.area);
      await api.confirmBlueprint(proposal.proposalId, {
        displayName: form.displayName.trim(),
        officialAddress: form.address.trim() || null,
        legalDescription: form.legal.trim() || null,
        aliases: [],
        floorAreaM2: form.area.trim() && Number.isFinite(area) ? area : null,
        levels: textToLevels(form.levels),
      });
      setProposal(null);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const field = (key: keyof typeof form, label: string) => (
    <label>
      {label}
      <input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </label>
  );

  return (
    <section className="card">
      <h2>拖入蓝图建工地</h2>
      {!proposal && (
        <label
          className="dropzone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) void upload(file);
          }}
        >
          {busy ? "AI 正在读图纸…" : "把 PDF 图纸拖到这里，或点击选择文件"}
          <input
            type="file"
            accept="application/pdf"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
        </label>
      )}
      {proposal && (
        <div className="form">
          <p className="muted">
            请核对 AI 识别结果（地址可信度 {proposal.confidence.address}，面积 {proposal.confidence.floorArea}，房间{" "}
            {proposal.confidence.rooms}）。{proposal.notes}
          </p>
          {field("displayName", "工地名称")}
          {field("address", "正式地址（新分区可留空）")}
          {field("legal", "Lot / DP")}
          {field("area", "面积 m²（仅图纸上写明的）")}
          <label>
            楼层与房间（每行一层，格式 楼层: 房间, 房间）
            <textarea
              rows={6}
              value={form.levels}
              onChange={(e) => setForm({ ...form, levels: e.target.value })}
            />
          </label>
          <div className="row">
            <button disabled={busy || !form.displayName.trim()} onClick={() => void confirm()}>
              确认建工地
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => {
                void api.reject(proposal.proposalId).catch(() => undefined);
                setProposal(null);
              }}
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
