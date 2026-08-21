import Link from "next/link";
import Footer from "@/components/Footer";
import Nav from "@/components/Nav";

export default function HowItWorksPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-6xl px-6 py-16 md:py-24">
        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-ice">
          Under the hood
        </p>
        <h1 className="mt-5 font-display text-3xl tracking-tight md:text-4xl">
          What actually happens to a file
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">
          Tele Upload is built on Telegram. Your file is uploaded through a Telegram bot and
          stored as a message in a private channel; every download hands off to Telegram
          to actually move the bytes. We never see or hold the file itself — only a
          pointer to it, and a record of who downloaded it and when, for pricing and payout
          purposes.
        </p>

        <div className="mt-12 grid gap-px overflow-hidden border border-line bg-line md:grid-cols-3">
          {[
            {
              k: "00 bytes",
              t: "Never proxied",
              d: "Uploads go from your Telegram client to Telegram. Downloads go from Telegram to the recipient. We hold a message ID.",
            },
            {
              k: "10 sec ×3",
              t: "Enforced server-side",
              d: "The countdown is decoration. Signed single-use tokens with real elapsed-time checks are what gate the download.",
            },
            {
              k: "10 min",
              t: "Then it is gone",
              d: "Delivered files delete themselves from the chat. The schedule lives in the database, so a restart cannot orphan one.",
            },
          ].map((c) => (
            <div key={c.t} className="bg-panel/70 p-7">
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-sodium">{c.k}</p>
              <h3 className="mt-4 font-display text-lg">{c.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{c.d}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 max-w-2xl border-l-2 border-sodium/60 pl-6">
          <h2 className="font-display text-xl tracking-tight">What this depends on</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Tele Upload runs on a platform it does not own. If a bot is banned or the
            storage channel is removed, every link stops working at once. The
            design hedges against it — we store message IDs rather than file IDs, so
            a replacement bot can serve the whole history — but no hedge survives an
            account-level ban. Keep your originals somewhere you control.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Upload only what you own or have permission to share.
          </p>
        </div>

        <div className="mt-16 max-w-2xl">
          <h2 className="font-display text-xl tracking-tight">How earnings are counted</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            A download only counts once the file actually reaches someone in Telegram —
            not just when they finish the wait on this site. We look at roughly where the
            download happened to apply that country&apos;s rate, filter out traffic that
            looks automated, and only count one paid download per visitor per file within
            a rolling window, so refreshing your own link repeatedly doesn&apos;t inflate
            your balance.
          </p>
        </div>

        <Link
          href="/signup"
          className="mt-12 inline-block border border-ice/50 bg-ice/10 px-6 py-3 font-mono text-xs uppercase tracking-[0.16em] text-ice transition-colors hover:bg-ice/20"
        >
          Start earning
        </Link>
      </main>
      <Footer />
    </>
  );
}
