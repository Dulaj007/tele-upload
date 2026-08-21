"use client";

import { useEffect, useState } from "react";
import { api, ApiError, formatBytes } from "@/lib/api";

type FileRow = {
  id: number;
  slug: string;
  original_name: string;
  size_bytes: number;
  download_count: number;
  deleted_at: string | null;
  created_at: string;
  telegram_link: string;
};

type CountryRow = { country_code: string | null; downloads: number; amount_usd: string };

type UserDetail = {
  id: number;
  handle: string;
  telegram_id: number;
  telegram_username: string | null;
  status: string;
  created_at: string;
  files: FileRow[];
  available_usd: string;
  held_usd: string;
  lifetime_usd: string;
  countries: CountryRow[];
};

export default function UserDetailPage({ params }: { params: { id: string } }) {
  const [user, setUser] = useState<UserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    api<UserDetail>(`/admin/users/${params.id}`)
      .then(setUser)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load this user."));
  }

  useEffect(load, [params.id]);

  async function toggleSuspend() {
    if (!user) return;
    setBusy(true);
    try {
      const action = user.status === "active" ? "suspend" : "unsuspend";
      await api(`/admin/users/${user.id}/${action}`, { method: "POST" });
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not update this user.");
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <p className="text-sm text-sodium">{error}</p>
      </main>
    );
  }
  if (!user) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight">{user.handle}</h1>
          <p className="mt-1 font-mono text-xs text-muted">
            {user.telegram_username ?? user.telegram_id} · joined{" "}
            {new Date(user.created_at).toLocaleDateString()}
          </p>
        </div>
        <button
          onClick={toggleSuspend}
          disabled={busy}
          className={`border px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.16em] transition-colors disabled:opacity-50 ${
            user.status === "active"
              ? "border-sodium/50 bg-sodium/10 text-sodium hover:bg-sodium/20"
              : "border-ice/50 bg-ice/10 text-ice hover:bg-ice/20"
          }`}
        >
          {user.status === "active" ? "Suspend user" : "Unsuspend user"}
        </button>
      </div>

      <div className="mt-8 grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-3">
        <div className="bg-panel/70 p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Available</p>
          <p className="mt-2 font-display text-2xl text-ice">${Number(user.available_usd).toFixed(2)}</p>
        </div>
        <div className="bg-panel/70 p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Held</p>
          <p className="mt-2 font-display text-2xl text-sodium">${Number(user.held_usd).toFixed(2)}</p>
        </div>
        <div className="bg-panel/70 p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Lifetime</p>
          <p className="mt-2 font-display text-2xl text-ink">${Number(user.lifetime_usd).toFixed(2)}</p>
        </div>
      </div>

      {user.countries.length > 0 && (
        <>
          <h2 className="mt-12 font-display text-xl tracking-tight">By country</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[400px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                  <th className="py-2 pr-4">Country</th>
                  <th className="py-2 pr-4">Downloads</th>
                  <th className="py-2">Earned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {user.countries.map((c) => (
                  <tr key={c.country_code ?? "unknown"}>
                    <td className="py-2 pr-4 font-mono text-xs">{c.country_code ?? "—"}</td>
                    <td className="py-2 pr-4 text-muted">{c.downloads}</td>
                    <td className="py-2 font-mono text-xs text-ink">${Number(c.amount_usd).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2 className="mt-12 font-display text-xl tracking-tight">Files ({user.files.length})</h2>
      {user.files.length === 0 && <p className="mt-4 text-sm text-muted">No files uploaded.</p>}
      {user.files.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Size</th>
                <th className="py-2 pr-4">Downloads</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {user.files.map((f) => (
                <tr key={f.id}>
                  <td className="max-w-[220px] truncate py-2 pr-4">{f.original_name}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-muted">{formatBytes(f.size_bytes)}</td>
                  <td className="py-2 pr-4 text-muted">{f.download_count}</td>
                  <td className="py-2 pr-4 font-mono text-[11px] uppercase tracking-[0.16em]">
                    {f.deleted_at ? (
                      <span className="text-sodium">Deleted</span>
                    ) : (
                      <span className="text-ice">Live</span>
                    )}
                  </td>
                  <td className="py-2">
                    <a
                      href={f.telegram_link}
                      target="_blank"
                      rel="noreferrer"
                      className="text-ice hover:underline"
                    >
                      Open in Telegram
                    </a>
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
