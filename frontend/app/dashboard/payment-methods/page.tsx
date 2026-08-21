"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";

type MethodOption = {
  id: number;
  name: string;
  identifier_label: string;
  min_payout_usd: string;
};

type SavedMethod = {
  id: number;
  method_name: string;
  identifier_label: string;
  account_identifier: string;
  is_default: boolean;
  min_payout_usd: string;
};

export default function PaymentMethodsPage() {
  const [options, setOptions] = useState<MethodOption[] | null>(null);
  const [methods, setMethods] = useState<SavedMethod[] | null>(null);
  const [methodTypeId, setMethodTypeId] = useState<number | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    api<MethodOption[]>("/earnings/payout-methods")
      .then((opts) => {
        setOptions(opts);
        if (opts.length > 0) setMethodTypeId((id) => id ?? opts[0].id);
      })
      .catch(() => setOptions([]));
    api<SavedMethod[]>("/earnings/payment-methods").then(setMethods).catch(() => setMethods([]));
  }

  useEffect(load, []);

  const selected = options?.find((o) => o.id === methodTypeId) ?? null;

  async function addMethod() {
    if (!methodTypeId) return;
    setBusy(true);
    setError(null);
    try {
      await api("/earnings/payment-methods", {
        method: "POST",
        body: JSON.stringify({ method_type_id: methodTypeId, account_identifier: identifier }),
      });
      setIdentifier("");
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not add that payout method.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    await api(`/earnings/payment-methods/${id}`, { method: "DELETE" }).catch(() => {});
    load();
  }

  async function makeDefault(id: number) {
    await api(`/earnings/payment-methods/${id}/default`, { method: "POST" }).catch(() => {});
    load();
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="font-display text-3xl tracking-tight">Payment methods</h1>
      <p className="mt-2 text-sm text-muted">
        Payouts go to your default method. Double-check the details you enter — a payout
        sent to the wrong account can&apos;t be recovered.
      </p>

      {methods === null && (
        <p className="mt-8 font-mono text-xs uppercase tracking-[0.16em] text-muted">Loading…</p>
      )}

      {methods !== null && methods.length > 0 && (
        <ul className="mt-8 divide-y divide-line border-y border-line">
          {methods.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-4 py-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink">
                  {m.method_name}
                  {m.is_default && (
                    <span className="ml-2 border border-ice/45 bg-ice/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-ice">
                      Default
                    </span>
                  )}
                </p>
                <p className="mt-1 truncate font-mono text-[11px] text-muted">
                  {m.identifier_label}: {m.account_identifier}
                </p>
              </div>
              <div className="flex gap-2">
                {!m.is_default && (
                  <button
                    onClick={() => makeDefault(m.id)}
                    className="border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-muted transition-colors hover:border-ice/50 hover:text-ice"
                  >
                    Make default
                  </button>
                )}
                <button
                  onClick={() => remove(m.id)}
                  className="border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-muted transition-colors hover:border-sodium/50 hover:text-sodium"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-12 font-display text-xl tracking-tight">Add a method</h2>

      {options !== null && options.length === 0 && (
        <p className="mt-4 text-sm text-muted">No payout methods are available right now.</p>
      )}

      {options !== null && options.length > 0 && (
        <>
          <div className="mt-6 flex flex-wrap gap-3 font-mono text-xs uppercase tracking-[0.16em]">
            {options.map((o) => (
              <button
                key={o.id}
                onClick={() => setMethodTypeId(o.id)}
                className={`border px-4 py-2 transition-colors ${
                  methodTypeId === o.id
                    ? "border-ice/60 bg-ice/10 text-ice"
                    : "border-line text-muted hover:text-ink"
                }`}
              >
                {o.name}
              </button>
            ))}
          </div>

          {selected && (
            <p className="mt-3 font-mono text-[11px] text-muted">
              Minimum payout with {selected.name}: ${Number(selected.min_payout_usd).toFixed(2)}
            </p>
          )}

          <label className="mt-4 block">
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
              {selected?.identifier_label ?? "Account details"}
            </span>
            <input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="mt-2 w-full border border-line bg-panel px-4 py-3 font-mono text-sm outline-none focus:border-ice/60"
            />
          </label>

          <button
            onClick={addMethod}
            disabled={busy || !methodTypeId || identifier.trim().length < 1}
            className="mt-6 border border-ice/50 bg-ice/10 px-6 py-3 font-mono text-[11px] uppercase tracking-[0.16em] text-ice transition-colors hover:bg-ice/20 disabled:cursor-not-allowed disabled:border-line disabled:bg-transparent disabled:text-muted"
          >
            {busy ? "Adding…" : "Add method"}
          </button>
        </>
      )}

      {error && (
        <p role="alert" className="mt-5 border-l-2 border-sodium bg-sodium/5 px-4 py-3 text-sm text-sodium">
          {error}
        </p>
      )}
    </main>
  );
}
