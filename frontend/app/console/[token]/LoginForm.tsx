"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";

export default function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api("/admin/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      router.push("/console/overview");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not sign you in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-24">
      <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted">Tele Upload</p>
      <h1 className="mt-3 font-display text-2xl tracking-tight">Admin sign-in</h1>

      <input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="username"
        aria-label="Username"
        autoFocus
        className="mt-8 w-full border border-line bg-panel px-5 py-3.5 font-mono text-sm outline-none focus:border-ice/60"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="password"
        aria-label="Password"
        className="mt-3 w-full border border-line bg-panel px-5 py-3.5 text-sm outline-none focus:border-ice/60"
      />

      <button
        onClick={submit}
        disabled={busy || !username || !password}
        className="mt-6 w-full border border-ice/50 bg-ice/10 px-6 py-4 font-mono text-xs uppercase tracking-[0.16em] text-ice transition-colors hover:bg-ice/20 disabled:border-line disabled:bg-transparent disabled:text-muted"
      >
        {busy ? "Working…" : "Sign in"}
      </button>

      {error && (
        <p role="alert" className="mt-5 border-l-2 border-sodium bg-sodium/5 px-4 py-3 text-sm text-sodium">
          {error}
        </p>
      )}
    </main>
  );
}
