"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";

type MethodType = {
  id: number;
  name: string;
  identifier_label: string;
  fee_flat_usd: string;
  fee_percent: string;
  min_payout_usd: string;
  is_active: boolean;
  created_at: string;
};

type Draft = {
  name: string;
  identifier_label: string;
  fee_flat_usd: string;
  fee_percent: string;
  min_payout_usd: string;
  is_active: boolean;
};

function toDraft(m: MethodType): Draft {
  return {
    name: m.name, identifier_label: m.identifier_label,
    fee_flat_usd: m.fee_flat_usd, fee_percent: m.fee_percent,
    min_payout_usd: m.min_payout_usd, is_active: m.is_active,
  };
}

export default function PayoutMethodsPage() {
  const [methods, setMethods] = useState<MethodType[] | null>(null);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [newDraft, setNewDraft] = useState<Draft>({
    name: "", identifier_label: "Account details", fee_flat_usd: "0",
    fee_percent: "0", min_payout_usd: "20", is_active: true,
  });
  const [addBusy, setAddBusy] = useState(false);

  function load() {
    api<MethodType[]>("/admin/payout-methods")
      .then((ms) => {
        setMethods(ms);
        setDrafts(Object.fromEntries(ms.map((m) => [m.id, toDraft(m)])));
      })
      .catch(() => setMethods([]));
  }

  useEffect(load, []);

  function setDraft(id: number, patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  }

  async function save(id: number) {
    setBusyId(id);
    setError(null);
    const d = drafts[id];
    try {
      await api(`/admin/payout-methods/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: d.name, identifier_label: d.identifier_label,
          fee_flat_usd: d.fee_flat_usd, fee_percent: d.fee_percent,
          min_payout_usd: d.min_payout_usd, is_active: d.is_active,
        }),
      });
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save that method.");
    } finally {
      setBusyId(null);
    }
  }

  async function addMethod() {
    setAddBusy(true);
    setError(null);
    try {
      await api("/admin/payout-methods", { method: "POST", body: JSON.stringify(newDraft) });
      setNewDraft({
        name: "", identifier_label: "Account details", fee_flat_usd: "0",
        fee_percent: "0", min_payout_usd: "20", is_active: true,
      });
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not add that method.");
    } finally {
      setAddBusy(false);
    }
  }

  const inputClass =
    "w-full border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-ice/60";

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="font-display text-3xl tracking-tight">Payout methods</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Fee is flat + percent of the payout, deducted before sending. A method can never
        have a flat fee at or above its own minimum payout.
      </p>

      {error && (
        <p role="alert" className="mt-6 border-l-2 border-sodium bg-sodium/5 px-4 py-3 text-sm text-sodium">
          {error}
        </p>
      )}

      {methods === null && (
        <p className="mt-6 font-mono text-xs uppercase tracking-[0.16em] text-muted">Loading…</p>
      )}

      {methods !== null && methods.length > 0 && (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Identifier label</th>
                <th className="py-2 pr-3">Flat fee</th>
                <th className="py-2 pr-3">Fee %</th>
                <th className="py-2 pr-3">Min payout</th>
                <th className="py-2 pr-3">Active</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {methods.map((m) => {
                const d = drafts[m.id] ?? toDraft(m);
                return (
                  <tr key={m.id} className={m.is_active ? "" : "opacity-50"}>
                    <td className="py-2 pr-3">
                      <input
                        value={d.name}
                        onChange={(e) => setDraft(m.id, { name: e.target.value })}
                        className={inputClass}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        value={d.identifier_label}
                        onChange={(e) => setDraft(m.id, { identifier_label: e.target.value })}
                        className={inputClass}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        value={d.fee_flat_usd}
                        onChange={(e) => setDraft(m.id, { fee_flat_usd: e.target.value })}
                        className={`${inputClass} w-24 font-mono`}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        value={d.fee_percent}
                        onChange={(e) => setDraft(m.id, { fee_percent: e.target.value })}
                        className={`${inputClass} w-20 font-mono`}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        value={d.min_payout_usd}
                        onChange={(e) => setDraft(m.id, { min_payout_usd: e.target.value })}
                        className={`${inputClass} w-24 font-mono`}
                      />
                    </td>
                    <td className="py-2 pr-3 text-center">
                      <input
                        type="checkbox"
                        checked={d.is_active}
                        onChange={(e) => setDraft(m.id, { is_active: e.target.checked })}
                      />
                    </td>
                    <td className="py-2">
                      <button
                        onClick={() => save(m.id)}
                        disabled={busyId === m.id}
                        className="border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-muted transition-colors hover:border-ice/50 hover:text-ice disabled:opacity-50"
                      >
                        {busyId === m.id ? "Saving…" : "Save"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mt-12 font-display text-xl tracking-tight">Add a method</h2>
      <div className="mt-6 grid max-w-3xl gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Name</span>
          <input
            value={newDraft.name}
            onChange={(e) => setNewDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="e.g. USDT (TRC20)"
            className={`mt-2 ${inputClass}`}
          />
        </label>
        <label className="block">
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
            Identifier label
          </span>
          <input
            value={newDraft.identifier_label}
            onChange={(e) => setNewDraft((d) => ({ ...d, identifier_label: e.target.value }))}
            placeholder="e.g. Wallet address"
            className={`mt-2 ${inputClass}`}
          />
        </label>
        <label className="block">
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
            Flat fee (USD)
          </span>
          <input
            value={newDraft.fee_flat_usd}
            onChange={(e) => setNewDraft((d) => ({ ...d, fee_flat_usd: e.target.value }))}
            className={`mt-2 ${inputClass} font-mono`}
          />
        </label>
        <label className="block">
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Fee %</span>
          <input
            value={newDraft.fee_percent}
            onChange={(e) => setNewDraft((d) => ({ ...d, fee_percent: e.target.value }))}
            className={`mt-2 ${inputClass} font-mono`}
          />
        </label>
        <label className="block">
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
            Minimum payout (USD)
          </span>
          <input
            value={newDraft.min_payout_usd}
            onChange={(e) => setNewDraft((d) => ({ ...d, min_payout_usd: e.target.value }))}
            className={`mt-2 ${inputClass} font-mono`}
          />
        </label>
      </div>
      <button
        onClick={addMethod}
        disabled={addBusy || !newDraft.name.trim()}
        className="mt-6 border border-ice/50 bg-ice/10 px-6 py-3 font-mono text-[11px] uppercase tracking-[0.16em] text-ice transition-colors hover:bg-ice/20 disabled:cursor-not-allowed disabled:border-line disabled:bg-transparent disabled:text-muted"
      >
        {addBusy ? "Adding…" : "Add method"}
      </button>
    </main>
  );
}
