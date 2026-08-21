"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

export default function Nav() {
  const [open, setOpen] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    api("/files/me").then(() => setAuthed(true)).catch(() => setAuthed(false));
  }, []);

  // Signed-out visitors go straight to sign-in rather than bouncing through
  // the dashboard's own auth gate first.
  const links = [
    { href: authed ? "/dashboard" : "/login", label: "User area" },
    { href: "/login", label: "Sign in" },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-void/80 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <span className="block h-2.5 w-2.5 rotate-45 border border-ice bg-ice/25" />
          <span className="font-display text-lg tracking-tight">Tele Upload</span>
        </Link>

        {/* Desktop links */}
        <div className="hidden items-center gap-6 font-mono text-[11px] uppercase tracking-[0.16em] sm:flex">
          {links.map((l) => (
            <Link key={l.label} href={l.href} className="text-muted transition-colors hover:text-ink">
              {l.label}
            </Link>
          ))}
          <Link
            href="/signup"
            className="border border-ice/45 bg-ice/10 px-3.5 py-1.5 text-ice transition-colors hover:bg-ice/20"
          >
            Start earning
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className="flex h-9 w-9 flex-col items-center justify-center gap-1.5 sm:hidden"
        >
          <span
            className={`block h-px w-5 bg-ink transition-transform ${open ? "translate-y-[3.5px] rotate-45" : ""}`}
          />
          <span
            className={`block h-px w-5 bg-ink transition-transform ${open ? "-translate-y-[3.5px] -rotate-45" : ""}`}
          />
        </button>
      </nav>

      {/* Mobile panel */}
      {open && (
        <div className="border-t border-line/70 px-6 py-4 sm:hidden">
          <div className="flex flex-col gap-4 font-mono text-xs uppercase tracking-[0.16em]">
            {links.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                onClick={() => setOpen(false)}
                className="text-muted transition-colors hover:text-ink"
              >
                {l.label}
              </Link>
            ))}
            <Link
              href="/signup"
              onClick={() => setOpen(false)}
              className="border border-ice/45 bg-ice/10 px-3.5 py-2.5 text-center text-ice transition-colors hover:bg-ice/20"
            >
              Start earning
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
