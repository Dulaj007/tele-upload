"use client";

import { useEffect, useState } from "react";
import { api, ApiError, formatBytes } from "@/lib/api";

type FileRow = {
  id: number;
  slug: string;
  original_name: string;
  owner_handle: string;
  size_bytes: number;
  download_count: number;
  deleted_at: string | null;
  created_at: string;
  telegram_link: string;
};

export default function FilesPage() {
  const [rows, setRows] = useState<FileRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  function load(query: string) {
    api<{ total: number; rows: FileRow[] }>(`/admin/files?limit=100&q=${encodeURIComponent(query)}`)
      .then((d) => {
        setRows(d.rows);
        setTotal(d.total);
      })
      .catch(() => setRows([]));
  }

  useEffect(() => {
    load("");
  }, []);

  async function remove(slug: string) {
    setError(null);
    try {
      await api(`/admin/files/${slug}/delete`, { method: "POST" });
      load(q);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not delete that file.");
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="font-display text-3xl tracking-tight">Files</h1>
        <p className="font-mono text-xs text-muted">{total} total</p>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && load(q)}
        placeholder="Search by file name or owner handle…"
        className="mt-6 w-full max-w-sm border border-line bg-panel px-4 py-2.5 text-sm outline-none focus:border-ice/60"
      />

      {error && (
        <p role="alert" className="mt-4 border-l-2 border-sodium bg-sodium/5 px-4 py-3 text-sm text-sodium">
          {error}
        </p>
      )}

      {rows === null && (
        <p className="mt-6 font-mono text-xs uppercase tracking-[0.16em] text-muted">Loading…</p>
      )}
      {rows !== null && rows.length === 0 && <p className="mt-6 text-sm text-muted">No files found.</p>}
      {rows !== null && rows.length > 0 && (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[800px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                <th className="py-3 pr-4">Name</th>
                <th className="py-3 pr-4">Owner</th>
                <th className="py-3 pr-4">Size</th>
                <th className="py-3 pr-4">Downloads</th>
                <th className="py-3 pr-4">Status</th>
                <th className="py-3 pr-4">Source</th>
                <th className="py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((f) => (
                <tr key={f.id}>
                  <td className="max-w-[220px] truncate py-3 pr-4">{f.original_name}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-muted">{f.owner_handle}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-muted">{formatBytes(f.size_bytes)}</td>
                  <td className="py-3 pr-4 text-muted">{f.download_count}</td>
                  <td className="py-3 pr-4 font-mono text-[11px] uppercase tracking-[0.16em]">
                    {f.deleted_at ? (
                      <span className="text-sodium">Deleted</span>
                    ) : (
                      <span className="text-ice">Live</span>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <a
                      href={f.telegram_link}
                      target="_blank"
                      rel="noreferrer"
                      className="text-ice hover:underline"
                    >
                      Telegram
                    </a>
                  </td>
                  <td className="py-3">
                    {!f.deleted_at && (
                      <button
                        onClick={() => remove(f.slug)}
                        className="border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-muted transition-colors hover:border-sodium/50 hover:text-sodium"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
