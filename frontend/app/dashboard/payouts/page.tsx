"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";

type Summary = { available_usd: string };
type PaymentMethod = { id: number; method_name: string; is_default: boolean; min_payout_usd: string };
type Payout = {
  id: number;
  method_name: string;
  account_identifier: string;
  amount_gross_usd: string;
  fee_usd: string;
  amount_net_usd: string;
  status: "pending" | "paid" | "rejected";
  requested_at: string;
  resolved_at: string | null;
};

function money(v: string | number) {
  return `$${Number(v).toFixed(2)}`;
}

const STATUS_COLOR: Record<Payout["status"], string> = {
  pending: "text-sodium",
  paid: "text-ice",
  rejected: "text-muted",
};

export default function PayoutsPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [defaultMethod, setDefaultMethod] = useState<PaymentMethod | null | undefined>(undefined);
  const [payouts, setPayouts] = useState<Payout[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<Summary>("/earnings/summary").then(setSummary).catch(() => {});
    api<PaymentMethod[]>("/earnings/payment-methods")
      .then((ms) => setDefaultMethod(ms.find((m) => m.is_default) ?? null))
      .catch(() => setDefaultMethod(null));
    api<Payout[]>("/earnings/payouts").then(setPayouts).catch(() => setPayouts([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function requestPayout() {
    setBusy(true);
    setError(null);
    try {
      await api("/earnings/payouts", { method: "POST" });
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not request a payout.");
    } finally {
      setBusy(false);
    }
  }

  const available = summary ? Number(summary.available_usd) : 0;
  const min = defaultMethod ? Number(defaultMethod.min_payout_usd) : Infinity;
  const hasDefault = defaultMethod !== undefined && defaultMethod !== null;
  const canRequest = hasDefault && available >= min;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="font-display text-3xl tracking-tight">Payouts</h1>
      <p className="mt-2 text-sm text-muted">
        Paid out to your default method, minus that method&apos;s fee. Requests are
        reviewed and sent manually, not instantly.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border border-line bg-panel/70 p-6">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
            Available to withdraw
          </p>
          <p className="mt-1 font-display text-3xl text-ice">
            {summary ? money(summary.available_usd) : "—"}
          </p>
        </div>
        <div className="text-right">
          <button
            onClick={requestPayout}
            disabled={busy || !canRequest}
            className="border border-ice/50 bg-ice/10 px-6 py-3 font-mono text-[11px] uppercase tracking-[0.16em] text-ice transition-colors hover:bg-ice/20 disabled:cursor-not-allowed disabled:border-line disabled:bg-transparent disabled:text-muted"
          >
            {busy ? "Requesting…" : "Request payout"}
          </button>
          {summary && !canRequest && defaultMethod !== undefined && (
            <p className="mt-2 max-w-xs font-mono text-[11px] text-muted">
              {hasDefault
                ? `Minimum payout with ${defaultMethod!.method_name} is ${money(defaultMethod!.min_payout_usd)}.`
                : "Add a payment method first."}
            </p>
          )}
          {defaultMethod === null && (
            <Link href="/dashboard/payment-methods" className="mt-2 block text-xs text-ice underline-offset-4 hover:underline">
              Add one now
            </Link>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-6 border-l-2 border-sodium bg-sodium/5 px-4 py-3 text-sm text-sodium">
          {error}
        </p>
      )}

      <h2 className="mt-12 font-display text-xl tracking-tight">History</h2>
      {payouts === null && (
        <p className="mt-4 font-mono text-xs uppercase tracking-[0.16em] text-muted">Loading…</p>
      )}
      {payouts !== null && payouts.length === 0 && (
        <p className="mt-4 text-sm text-muted">No payouts requested yet.</p>
      )}
      {payouts !== null && payouts.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                <th className="py-3 pr-4">Amount</th>
                <th className="py-3 pr-4">Destination</th>
                <th className="py-3 pr-4">Status</th>
                <th className="py-3">Requested</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {payouts.map((p) => (
                <tr key={p.id}>
                  <td className="py-3 pr-4">
                    <p className="font-mono text-xs text-ink">{money(p.amount_net_usd)}</p>
                    {Number(p.fee_usd) > 0 && (
                      <p className="mt-0.5 font-mono text-[10px] text-muted">
                        {money(p.amount_gross_usd)} − {money(p.fee_usd)} fee
                      </p>
                    )}
                  </td>
                  <td className="max-w-[220px] truncate py-3 pr-4 font-mono text-xs text-muted">
                    {p.method_name} · {p.account_identifier}
                  </td>
                  <td className={`py-3 pr-4 font-mono text-[11px] uppercase tracking-[0.16em] ${STATUS_COLOR[p.status]}`}>
                    {p.status}
                  </td>
                  <td className="py-3 font-mono text-xs text-muted">
                    {new Date(p.requested_at).toLocaleString()}
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
