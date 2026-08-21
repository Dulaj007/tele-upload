"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Footer from "@/components/Footer";
import Nav from "@/components/Nav";
import { api, ApiError } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api("/auth/login", { method: "POST", body: JSON.stringify({ handle, password }) });
      router.push("/dashboard");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not sign you in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-md px-6 py-24">
        <h1 className="font-display text-3xl tracking-tight">Sign in</h1>
        <p className="mt-3 text-sm text-muted">Your handle is the one Telegram gave you.</p>

        <input
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="handle"
          aria-label="Handle"
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
          disabled={busy || !handle || !password}
          className="mt-6 w-full border border-ice/50 bg-ice/10 px-6 py-4 font-mono text-xs uppercase tracking-[0.16em] text-ice transition-colors hover:bg-ice/20 disabled:border-line disabled:bg-transparent disabled:text-muted"
        >
          {busy ? "Working…" : "Sign in"}
        </button>

        {error && (
          <p role="alert" className="mt-5 border-l-2 border-sodium bg-sodium/5 px-4 py-3 text-sm text-sodium">
            {error}
          </p>
        )}

        <p className="mt-8 text-sm text-muted">
          No account?{" "}
          <Link href="/signup" className="text-ice underline-offset-4 hover:underline">
            Register through Telegram
          </Link>
        </p>
      </main>
      <Footer />
    </>
  );
}
