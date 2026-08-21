"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type UserRow = {
  id: number;
  handle: string;
  telegram_id: number;
  telegram_username: string | null;
  status: string;
  file_count: number;
  lifetime_earned_usd: string;
  created_at: string;
};

export default function UsersPage() {
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");

  function load(query: string) {
    api<{ total: number; rows: UserRow[] }>(`/admin/users?limit=100&q=${encodeURIComponent(query)}`)
      .then((d) => {
        setRows(d.rows);
        setTotal(d.total);
      })
      .catch(() => setRows([]));
  }

  useEffect(() => {
    load("");
  }, []);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="font-display text-3xl tracking-tight">Users</h1>
        <p className="font-mono text-xs text-muted">{total} total</p>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && load(q)}
        placeholder="Search by handle or Telegram username…"
        className="mt-6 w-full max-w-sm border border-line bg-panel px-4 py-2.5 text-sm outline-none focus:border-ice/60"
      />

      {rows === null && (
        <p className="mt-6 font-mono text-xs uppercase tracking-[0.16em] text-muted">Loading…</p>
      )}
      {rows !== null && rows.length === 0 && <p className="mt-6 text-sm text-muted">No users found.</p>}
      {rows !== null && rows.length > 0 && (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                <th className="py-3 pr-4">Handle</th>
                <th className="py-3 pr-4">Telegram</th>
                <th className="py-3 pr-4">Status</th>
                <th className="py-3 pr-4">Files</th>
                <th className="py-3 pr-4">Earned</th>
                <th className="py-3">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((u) => (
                <tr key={u.id}>
                  <td className="py-3 pr-4">
                    <Link href={`/console/users/${u.id}`} className="text-ice hover:underline">
                      {u.handle}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs text-muted">
                    {u.telegram_username ?? u.telegram_id}
                  </td>
                  <td className="py-3 pr-4 font-mono text-[11px] uppercase tracking-[0.16em]">
                    <span className={u.status === "active" ? "text-ice" : "text-sodium"}>{u.status}</span>
                  </td>
                  <td className="py-3 pr-4 text-muted">{u.file_count}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-ink">
                    ${Number(u.lifetime_earned_usd).toFixed(2)}
                  </td>
                  <td className="py-3 font-mono text-xs text-muted">
                    {new Date(u.created_at).toLocaleDateString()}
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
