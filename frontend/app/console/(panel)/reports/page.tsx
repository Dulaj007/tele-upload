"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Report = {
  id: number;
  file_id: number;
  file_name: string;
  owner_handle: string;
  reason: string;
  message: string | null;
  created_at: string;
  resolved_at: string | null;
  resolution: string | null;
};

export default function ReportsPage() {
  const [rows, setRows] = useState<Report[] | null>(null);
  const [openOnly, setOpenOnly] = useState(true);
  const [notes, setNotes] = useState<Record<number, string>>({});

  function load() {
    api<Report[]>(`/admin/file-reports?open_only=${openOnly}`)
      .then(setRows)
      .catch(() => setRows([]));
  }

  useEffect(load, [openOnly]);

  async function resolve(id: number, deleteFile: boolean) {
    await api(`/admin/file-reports/${id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ resolution: notes[id] || null, delete_file: deleteFile }),
    }).catch(() => {});
    load();
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl tracking-tight">File reports</h1>
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
          {rows.map((r) => (
            <li key={r.id} className="py-5">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <p className="text-sm text-ink">
                  {r.file_name} <span className="font-mono text-xs text-muted">— by {r.owner_handle}</span>
                </p>
                <p className="font-mono text-[11px] text-muted">
                  {new Date(r.created_at).toLocaleString()}
                </p>
              </div>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.16em] text-sodium">
                {r.reason}
              </p>
              {r.message && <p className="mt-2 max-w-2xl text-sm text-muted">{r.message}</p>}

              {!r.resolved_at ? (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <input
                    value={notes[r.id] ?? ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                    placeholder="Resolution note (optional)"
                    className="min-w-[220px] flex-1 border border-line bg-panel px-3 py-1.5 text-sm outline-none focus:border-ice/60"
                  />
                  <button
                    onClick={() => resolve(r.id, false)}
                    className="border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-muted transition-colors hover:border-ice/50 hover:text-ice"
                  >
                    Dismiss
                  </button>
                  <button
                    onClick={() => resolve(r.id, true)}
                    className="border border-sodium/50 bg-sodium/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-sodium transition-colors hover:bg-sodium/20"
                  >
                    Resolve &amp; delete file
                  </button>
                </div>
              ) : (
                <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.16em] text-ice">
                  Resolved{r.resolution ? `: ${r.resolution}` : ""}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
