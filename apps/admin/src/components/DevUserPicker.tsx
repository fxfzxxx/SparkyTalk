"use client";

import { useEffect, useState } from "react";
import { api, getDevUserId, setDevUserId } from "@/lib/api";

/** Temporary stand-in for login until real auth is chosen: type a username (admin, worker1…). */
export function DevUserPicker() {
  const [value, setValue] = useState("");
  const [who, setWho] = useState<string | null>(null);

  useEffect(() => {
    const saved = getDevUserId() ?? "";
    setValue(saved);
    if (saved) {
      api
        .me()
        .then((u) => setWho(u.name))
        .catch(() => setWho("用户名不存在"));
    }
  }, []);

  const save = () => {
    const next = value.trim().toLowerCase();
    if (next === (getDevUserId() ?? "")) return;
    setDevUserId(next);
    location.reload();
  };

  return (
    <label className="dev-user">
      用户名
      <input
        value={value}
        placeholder="admin / worker1 / worker2"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
        }}
        onBlur={save}
      />
      {who && <span>{who}</span>}
    </label>
  );
}
