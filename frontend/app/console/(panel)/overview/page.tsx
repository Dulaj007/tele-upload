"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Overview = {
  users: number;
  files: number;
  downloads_total: number;
  downloads_payable: number;
  paid_out_usd: string;
  pending_payout_usd: string;
  open_contact: number;
  open_reports: number;
};

function money(v: string) {
  return `$${Number(v).toFixed(2)}`;
}

export default function OverviewPage() {
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => {
    api<Overview>("/admin/overview").then(setData).catch(() => {});
  }, []);

  if (!data) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted">Loading…</p>
      </main>
    );
  }

  const tiles = [
    { label: "Users", value: data.users.toLocaleString() },
    { label: "Files", value: data.files.toLocaleString() },
    { label: "Downloads (payable)", value: `${data.downloads_payable.toLocaleString()} / ${data.downloads_total.toLocaleString()}` },
    { label: "Paid out", value: money(data.paid_out_usd) },
    { label: "Pending payouts", value: money(data.pending_payout_usd) },
    { label: "Open contact messages", value: data.open_contact.toLocaleString() },
    { label: "Open file reports", value: data.open_reports.toLocaleString() },
  ];

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="font-display text-3xl tracking-tight">Overview</h1>
      <div className="mt-8 grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="bg-panel/70 p-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">{t.label}</p>
            <p className="mt-2 font-display text-2xl text-ink">{t.value}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
