"use client";

import { useState } from "react";
import Footer from "@/components/Footer";
import Nav from "@/components/Nav";
import { api, ApiError } from "@/lib/api";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api("/public/contact", {
        method: "POST",
        body: JSON.stringify({ name, email, message }),
      });
      setSent(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not send that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-xl px-6 py-16 md:py-24">
        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-ice">Contact</p>
        <h1 className="mt-5 font-display text-3xl tracking-tight md:text-4xl">Get in touch</h1>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          Question, problem with a payout, something else — write it below and we'll get back
          to you at the email you give.
        </p>

        {sent ? (
          <p className="mt-10 border-l-2 border-ice bg-ice/5 px-4 py-3 text-sm text-ice">
            Sent. Thanks — we'll get back to you soon.
          </p>
        ) : (
          <div className="mt-10 space-y-4">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              aria-label="Name"
              className="w-full border border-line bg-panel px-5 py-3.5 text-sm outline-none focus:border-ice/60"
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your email"
              aria-label="Email"
              className="w-full border border-line bg-panel px-5 py-3.5 text-sm outline-none focus:border-ice/60"
            />
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What's up?"
              aria-label="Message"
              rows={6}
              className="w-full border border-line bg-panel px-5 py-3.5 text-sm outline-none focus:border-ice/60"
            />
            <button
              onClick={submit}
              disabled={busy || !name.trim() || !email.trim() || !message.trim()}
              className="w-full border border-ice/50 bg-ice/10 px-6 py-4 font-mono text-xs uppercase tracking-[0.16em] text-ice transition-colors hover:bg-ice/20 disabled:cursor-not-allowed disabled:border-line disabled:bg-transparent disabled:text-muted"
            >
              {busy ? "Sending…" : "Send message"}
            </button>
            {error && (
              <p role="alert" className="border-l-2 border-sodium bg-sodium/5 px-4 py-3 text-sm text-sodium">
                {error}
              </p>
            )}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
