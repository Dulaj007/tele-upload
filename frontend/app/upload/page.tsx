"use client";

import { useEffect, useState } from "react";
import Footer from "@/components/Footer";
import Nav from "@/components/Nav";
import { api } from "@/lib/api";

/*
  Deliberately not a file input.

  A browser upload would put the bytes through our server and cap them at the
  Bot API's 50 MB upload limit. Sending the file inside Telegram avoids both:
  Telegram already has the bytes, so the bot only stores a pointer, and the
  ceiling becomes Telegram's own 2 GB rather than ours.
*/
export default function UploadPage() {
  const [bot, setBot] = useState<string | null>(null);

  useEffect(() => {
    api<{ upload_bot: string }>("/files/me")
      .then((d) => setBot(d.upload_bot))
      .catch(() => setBot(null));
  }, []);

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-xl px-6 py-24">
        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-ice">Uploading</p>
        <h1 className="mt-5 font-display text-3xl tracking-tight md:text-4xl">
          Files go through the bot
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          There is no upload box here on purpose. Sending a file inside Telegram means
          it never passes through our servers, which is why there is no size limit and
          no bandwidth cost. This page just points you at the right chat.
        </p>

        <ol className="mt-10 space-y-5 border-l border-line pl-6">
          {[
            "Open the bot and press Upload files.",
            "Send your file. Any size Telegram allows.",
            "The bot replies with a share link. It also appears on your dashboard.",
          ].map((s, i) => (
            <li key={i} className="relative text-sm text-muted">
              <span className="absolute -left-[1.85rem] font-mono text-[11px] text-ice">
                {String(i + 1).padStart(2, "0")}
              </span>
              {s}
            </li>
          ))}
        </ol>

        <a
          href={bot ? `https://t.me/${bot}` : "/login"}
          target={bot ? "_blank" : undefined}
          rel="noreferrer"
          className="mt-10 inline-block border border-ice/50 bg-ice/10 px-8 py-4 font-mono text-xs uppercase tracking-[0.16em] text-ice transition-colors hover:bg-ice/20"
        >
          {bot ? "Open the bot" : "Sign in first"}
        </a>
      </main>
      <Footer />
    </>
  );
}
