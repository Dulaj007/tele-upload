"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Message = {
  id: number;
  name: string;
  email: string;
  message: string;
  created_at: string;
  resolved_at: string | null;
};

export default function ContactPage() {
  const [rows, setRows] = useState<Message[] | null>(null);
  const [openOnly, setOpenOnly] = useState(true);

  function load() {
    api<Message[]>(`/admin/contact-messages?open_only=${openOnly}`)
      .then(setRows)
      .catch(() => setRows([]));
  }

  useEffect(load, [openOnly]);

  async function resolve(id: number) {
    await api(`/admin/contact-messages/${id}/resolve`, { method: "POST" }).catch(() => {});
    load();
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl tracking-tight">Contact messages</h1>
        <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
          <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
          Open only
        </label>
      </div>

      {rows === null && (
        <p className="mt-6 font-mono text-xs uppercase tracking-[0.16em] text-muted">Loading…</p>
      )}
      {rows !== null && rows.length === 0 && <p className="mt-6 text-sm text-muted">Nothing here.</p>}

      {rows !== null && rows.length > 0 && (
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {rows.map((m) => (
            <li key={m.id} className="py-5">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <p className="text-sm text-ink">
                  {m.name} <span className="font-mono text-xs text-muted">— {m.email}</span>
                </p>
                <p className="font-mono text-[11px] text-muted">
                  {new Date(m.created_at).toLocaleString()}
                </p>
              </div>
              <p className="mt-2 max-w-2xl whitespace-pre-wrap text-sm text-muted">{m.message}</p>
              {!m.resolved_at && (
                <button
                  onClick={() => resolve(m.id)}
                  className="mt-3 border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-muted transition-colors hover:border-ice/50 hover:text-ice"
                >
                  Mark resolved
                </button>
              )}
              {m.resolved_at && (
                <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.16em] text-ice">Resolved</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
