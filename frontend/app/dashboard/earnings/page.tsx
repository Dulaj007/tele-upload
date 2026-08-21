"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Summary = {
  available_usd: string;
  held_usd: string;
  lifetime_usd: string;
  downloads_total: number;
  downloads_payable: number;
};

type HistoryRow = {
  file_name: string;
  country_code: string | null;
  is_bot: boolean;
  payable: boolean;
  amount_usd: string;
  created_at: string;
};

function money(v: string) {
  return `$${Number(v).toFixed(2)}`;
}

export default function EarningsPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<HistoryRow[] | null>(null);

  useEffect(() => {
    api<Summary>("/earnings/summary").then(setSummary).catch(() => {});
    api<{ rows: HistoryRow[]; total: number }>("/earnings/history?limit=50")
      .then((d) => setRows(d.rows))
      .catch(() => setRows([]));
  }, []);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="font-display text-3xl tracking-tight">Earnings</h1>
      <p className="mt-2 text-sm text-muted">
        Every real download of your files, priced by where it happened. Held earnings
        clear after a short review window, then move to available.
      </p>

      {summary && (
        <div className="mt-8 grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-3">
          <div className="bg-panel/70 p-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Available</p>
            <p className="mt-2 font-display text-3xl text-ice">{money(summary.available_usd)}</p>
          </div>
          <div className="bg-panel/70 p-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Held</p>
            <p className="mt-2 font-display text-3xl text-sodium">{money(summary.held_usd)}</p>
          </div>
          <div className="bg-panel/70 p-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Lifetime</p>
            <p className="mt-2 font-display text-3xl text-ink">{money(summary.lifetime_usd)}</p>
          </div>
        </div>
      )}

      {summary && (
        <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
          {summary.downloads_payable} paid downloads of {summary.downloads_total} total
        </p>
      )}

      <h2 className="mt-12 font-display text-xl tracking-tight">Recent downloads</h2>
      {rows === null && (
        <p className="mt-4 font-mono text-xs uppercase tracking-[0.16em] text-muted">Loading…</p>
      )}
      {rows !== null && rows.length === 0 && (
        <p className="mt-4 text-sm text-muted">Nothing recorded yet.</p>
      )}
      {rows !== null && rows.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                <th className="py-3 pr-4">File</th>
                <th className="py-3 pr-4">Country</th>
                <th className="py-3 pr-4">Status</th>
                <th className="py-3 pr-4">Amount</th>
                <th className="py-3">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="max-w-[220px] truncate py-3 pr-4 text-ink">{r.file_name}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-muted">{r.country_code ?? "—"}</td>
                  <td className="py-3 pr-4">
                    {r.is_bot ? (
                      <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                        Filtered
                      </span>
                    ) : r.payable ? (
                      <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-ice">
                        Paid
                      </span>
                    ) : (
                      <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                        Duplicate
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs text-ink">{money(r.amount_usd)}</td>
                  <td className="py-3 font-mono text-xs text-muted">
                    {new Date(r.created_at).toLocaleString()}
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
