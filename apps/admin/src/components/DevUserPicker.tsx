"use client";

import { useEffect, useState } from "react";
import { getDevUserId, setDevUserId } from "@/lib/api";

/** Temporary stand-in for login until real auth is chosen. */
export function DevUserPicker() {
  const [value, setValue] = useState("");
  useEffect(() => setValue(getDevUserId() ?? ""), []);
  return (
    <label className="dev-user">
      开发用户 ID
      <input
        value={value}
        placeholder="x-dev-user-id"
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          setDevUserId(value.trim());
          location.reload();
        }}
      />
    </label>
  );
}
