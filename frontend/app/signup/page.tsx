"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Footer from "@/components/Footer";
import Nav from "@/components/Nav";
import { api, ApiError } from "@/lib/api";

/*
  Three phases across two devices.

  A browser tab and a Telegram chat share no channel, so the nonce travels out
  in a deep link and a six-digit code travels back. The code is what proves the
  same person holds both — without it, anyone who saw the nonce could finish
  signup against someone else's Telegram identity.
*/

type Phase = "link" | "code" | "password";
type StartResp = { deep_link: string; nonce: string };
type StatusResp = { state: string; handle: string | null };

export default function SignupPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("link");
  const [start, setStart] = useState<StartResp | null>(null);
  const [handle, setHandle] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const polling = useRef<number | null>(null);

  const begin = useCallback(async () => {
    setError(null);
    try {
      setStart(await api<StartResp>("/auth/signup/start", { method: "POST" }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not start. Try again.");
    }
  }, []);

  useEffect(() => {
    begin();
  }, [begin]);

  // Poll while the user is over in Telegram. Stops the moment the bot links up.
  useEffect(() => {
    if (!start || phase !== "link") return;
    polling.current = window.setInterval(async () => {
      try {
        const s = await api<StatusResp>(`/auth/signup/${start.nonce}`);
        if (s.state === "linked") {
          setHandle(s.handle);
          setPhase("code");
        } else if (s.state === "expired" || s.state === "burned") {
          setError("That signup expired. Start again.");
          setStart(null);
        }
      } catch {
        /* transient, keep polling */
      }
    }, 2000);
    return () => {
      if (polling.current) window.clearInterval(polling.current);
    };
  }, [start, phase]);

  async function submitCode() {
    if (!start) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<StatusResp>(`/auth/signup/${start.nonce}/code`, {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      setHandle(r.handle);
      setPhase("password");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not verify that code.");
    } finally {
      setBusy(false);
    }
  }

  async function submitPassword() {
    if (!start) return;
    if (pw !== pw2) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/auth/signup/${start.nonce}/password`, {
        method: "POST",
        body: JSON.stringify({ password: pw, confirm: pw2 }),
      });
      router.push("/dashboard");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not finish signup.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-xl px-6 py-16">
        <Steps phase={phase} />

        {phase === "link" && (
          <section className="rise">
            <h1 className="font-display text-3xl tracking-tight">Start in Telegram</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Your account is your Telegram account. Open the link below — it starts
              our bot and sends you a code. Leave this tab open.
            </p>
            {start ? (
              <a
                href={start.deep_link}
                target="_blank"
                rel="noreferrer"
                className="mt-8 block border border-ice/50 bg-ice/10 px-6 py-4 text-center font-mono text-xs uppercase tracking-[0.16em] text-ice transition-colors hover:bg-ice/20"
              >
                Open Telegram
              </a>
            ) : (
              <button
                onClick={begin}
                className="mt-8 block w-full border border-line px-6 py-4 font-mono text-xs uppercase tracking-[0.16em] text-muted"
              >
                Get a link
              </button>
            )}
            <p className="mt-5 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-ice" />
              Waiting for you to open the bot
            </p>
          </section>
        )}

        {phase === "code" && (
          <section className="rise">
            <h1 className="font-display text-3xl tracking-tight">Enter your code</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              The bot sent a six-digit code to your Telegram chat.
            </p>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoFocus
              aria-label="Six-digit code"
              className="mt-8 w-full border border-line bg-panel px-5 py-4 text-center font-mono text-3xl tracking-[0.5em] text-ink outline-none focus:border-ice/60"
              placeholder="000000"
            />
            <Action label="Verify code" onClick={submitCode} busy={busy} disabled={code.length !== 6} />
          </section>
        )}

        {phase === "password" && (
          <section className="rise">
            <h1 className="font-display text-3xl tracking-tight">Set a password</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              This is for signing in on the web. Telegram never needs it.
            </p>

            <div className="mt-8 border border-line bg-panel px-5 py-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                Your handle, permanently
              </p>
              <p className="mt-1 font-mono text-lg text-sodium">{handle}</p>
            </div>

            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoFocus
              placeholder="Password, 8 characters or more"
              aria-label="Password"
              className="mt-4 w-full border border-line bg-panel px-5 py-3.5 text-sm outline-none focus:border-ice/60"
            />
            <input
              type="password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              placeholder="Type it again"
              aria-label="Confirm password"
              className="mt-3 w-full border border-line bg-panel px-5 py-3.5 text-sm outline-none focus:border-ice/60"
            />
            <Action
              label="Create account"
              onClick={submitPassword}
              busy={busy}
              disabled={pw.length < 8 || pw2.length < 8}
            />
          </section>
        )}

        {error && (
          <p role="alert" className="mt-5 border-l-2 border-sodium bg-sodium/5 px-4 py-3 text-sm text-sodium">
            {error}
          </p>
        )}
      </main>
      <Footer />
    </>
  );
}

function Steps({ phase }: { phase: Phase }) {
  const order: Phase[] = ["link", "code", "password"];
  const names = { link: "Telegram", code: "Code", password: "Password" };
  const at = order.indexOf(phase);
  return (
    <ol className="mb-12 flex gap-6 font-mono text-[11px] uppercase tracking-[0.16em]">
      {order.map((p, i) => (
        <li key={p} className="flex items-center gap-2">
          <span
            className={`inline-block h-1.5 w-1.5 rotate-45 ${
              i <= at ? "bg-ice" : "bg-line"
            }`}
          />
          <span className={i <= at ? "text-ink" : "text-muted"}>{names[p]}</span>
        </li>
      ))}
    </ol>
  );
}

function Action({
  label, onClick, busy, disabled,
}: { label: string; onClick: () => void; busy: boolean; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      className="mt-6 w-full border border-ice/50 bg-ice/10 px-6 py-4 font-mono text-xs uppercase tracking-[0.16em] text-ice transition-colors hover:bg-ice/20 disabled:cursor-not-allowed disabled:border-line disabled:bg-transparent disabled:text-muted"
    >
      {busy ? "Working…" : label}
    </button>
  );
}
