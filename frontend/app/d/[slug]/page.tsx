"use client";

import { useCallback, useEffect, useState } from "react";
import Footer from "@/components/Footer";
import Nav from "@/components/Nav";
import { api, ApiError, formatBytes } from "@/lib/api";

/*
  The gate, client side.

  This countdown decides nothing. It exists so the wait is legible. Every
  transition posts the current signed token and the server independently checks
  the signature, the step number, the real elapsed time and the single-use
  nonce. Editing anything here just produces a rejection.

  Recipients are usually strangers with no account, so nothing on this page
  requires a session.
*/

type Gate = {
  slug: string;
  name: string;
  size_bytes: number;
  owner: string;
  step: number;
  total_steps: number;
  wait_seconds: number;
  token: string;
};

export default function DownloadPage({ params }: { params: { slug: string } }) {
  const { slug } = params;

  const [gate, setGate] = useState<Gate | null>(null);
  const [left, setLeft] = useState(0);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Gate>(`/d/${slug}`)
      .then((g) => {
        setGate(g);
        setLeft(g.wait_seconds);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load this file."));
  }, [slug]);

  useEffect(() => {
    if (left <= 0) return;
    const t = window.setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => window.clearTimeout(t);
  }, [left]);

  const advance = useCallback(async () => {
    if (!gate) return;
    setBusy(true);
    setError(null);
    try {
      if (gate.step < gate.total_steps) {
        const next = await api<Gate>(`/d/${slug}/advance`, {
          method: "POST",
          body: JSON.stringify({ token: gate.token, step: gate.step }),
        });
        setGate(next);
        setLeft(next.wait_seconds);
      } else {
        const r = await api<{ deep_link: string }>(`/d/${slug}/unlock`, {
          method: "POST",
          body: JSON.stringify({ token: gate.token }),
        });
        setDeepLink(r.deep_link);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "That did not work. Reload and start again.");
    } finally {
      setBusy(false);
    }
  }, [gate, slug]);

  if (error && !gate) {
    return (
      <Shell>
        <p className="font-display text-2xl">{error}</p>
      </Shell>
    );
  }

  if (!gate) {
    return (
      <Shell>
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted">Loading…</p>
      </Shell>
    );
  }

  if (deepLink) {
    return (
      <Shell>
        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-sodium">Unlocked</p>
        <h1 className="mt-5 font-display text-3xl tracking-tight md:text-4xl">
          Collect it in Telegram
        </h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
          This link works once and expires in ten minutes. The file arrives in your chat
          and deletes itself ten minutes after that, so save it if you want to keep it.
        </p>
        <a
          href={deepLink}
          className="mt-8 inline-block border border-sodium/55 bg-sodium/10 px-8 py-4 font-mono text-xs uppercase tracking-[0.16em] text-sodium transition-colors hover:bg-sodium/20"
        >
          Open Telegram
        </a>
      </Shell>
    );
  }

  const ready = left <= 0;

  return (
    <Shell>
      <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-ice">
        Step {gate.step} of {gate.total_steps}
      </p>

      <h1 className="mt-5 break-words font-display text-3xl tracking-tight md:text-4xl">
        {gate.name}
      </h1>
      <p className="mt-2 font-mono text-xs text-muted">
        {formatBytes(gate.size_bytes)} · shared by {gate.owner}
      </p>

      {/* Step pips double as the progress readout. */}
      <div className="mt-10 flex gap-2" aria-hidden>
        {Array.from({ length: gate.total_steps }).map((_, i) => (
          <span
            key={i}
            className={`h-0.5 flex-1 transition-colors duration-500 ${
              i < gate.step ? "bg-ice" : "bg-line"
            }`}
          />
        ))}
      </div>

      <div className="mt-10">
        {ready ? (
          <button
            onClick={advance}
            disabled={busy}
            className="w-full border border-ice/50 bg-ice/10 px-8 py-5 font-mono text-xs uppercase tracking-[0.16em] text-ice transition-colors hover:bg-ice/20 disabled:opacity-50 sm:w-auto"
          >
            {busy
              ? "Checking…"
              : gate.step < gate.total_steps
                ? "Continue"
                : "Get download link"}
          </button>
        ) : (
          <div className="flex items-baseline gap-3">
            <span className="font-display text-5xl tabular-nums text-ink">{left}</span>
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
              seconds
            </span>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-6 border-l-2 border-sodium bg-sodium/5 px-4 py-3 text-sm text-sodium">
          {error}
        </p>
      )}

      <p className="mt-12 max-w-md text-xs leading-relaxed text-muted">
        New here? Nothing to sign up for. Finish the steps and the file is sent to you
        in Telegram.
      </p>

      <ReportFile slug={slug} />
    </Shell>
  );
}

function ReportFile({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("Copyright");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await api(`/public/files/${slug}/report`, {
        method: "POST",
        body: JSON.stringify({ reason, message: message.trim() || null }),
      });
      setSent(true);
    } catch {
      // Best-effort affordance -- fail quiet rather than alarm a reporter.
      setSent(true);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return <p className="mt-4 text-xs text-muted">Thanks — we&apos;ll take a look.</p>;
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-4 text-xs text-muted underline-offset-4 hover:text-ink hover:underline"
      >
        Report this file
      </button>
    );
  }

  return (
    <div className="mt-4 max-w-sm space-y-2">
      <select
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        aria-label="Reason"
        className="w-full border border-line bg-panel px-3 py-2 text-xs outline-none focus:border-ice/60"
      >
        <option>Copyright</option>
        <option>Malware</option>
        <option>Spam</option>
        <option>Other</option>
      </select>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Anything else? (optional)"
        aria-label="Details"
        rows={2}
        className="w-full border border-line bg-panel px-3 py-2 text-xs outline-none focus:border-ice/60"
      />
      <button
        onClick={submit}
        disabled={busy}
        className="border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-muted transition-colors hover:border-sodium/50 hover:text-sodium disabled:opacity-50"
      >
        {busy ? "Sending…" : "Submit report"}
      </button>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      <main className="relative mx-auto flex min-h-[70vh] max-w-2xl flex-col justify-center px-6 py-20">
        <div className="grid-field pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative rise">{children}</div>
      </main>
      <Footer />
    </>
  );
}
