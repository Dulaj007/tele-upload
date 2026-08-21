import Link from "next/link";
import EarningsExample from "@/components/EarningsExample";
import Faq from "@/components/Faq";
import Footer from "@/components/Footer";
import Nav from "@/components/Nav";
import ProcessMap from "@/components/ProcessMap";
import RegionRates from "@/components/RegionRates";
import SignalText from "@/components/SignalText";
import TechStrip from "@/components/TechStrip";

const ICONS: Record<string, React.ReactNode> = {
  upload: (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" stroke="currentColor" className="h-6 w-6">
      <path d="M12 15V4M12 4l-4 4M12 4l4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  wallet: (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" stroke="currentColor" className="h-6 w-6">
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" strokeLinecap="round" />
      <circle cx="16.5" cy="14.5" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  ),
  globe: (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" stroke="currentColor" className="h-6 w-6">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.5 2.4 3.8 5.4 3.8 8.5s-1.3 6.1-3.8 8.5c-2.5-2.4-3.8-5.4-3.8-8.5S9.5 5.9 12 3.5Z" />
    </svg>
  ),
};

export default function Home() {
  return (
    <>
      <Nav />

      <main>
        {/* Hero. The pitch is simple: upload, share, get paid. */}
        <section className="relative overflow-hidden">
          <div className="grid-field pointer-events-none absolute inset-0" aria-hidden />
          <div
            className="pointer-events-none absolute -top-32 left-1/2 h-[36rem] w-[52rem] -translate-x-1/2 rounded-full opacity-60 blur-3xl"
            style={{
              background:
                "radial-gradient(closest-side, rgba(107,227,245,0.16), rgba(255,180,84,0.08) 55%, transparent 75%)",
            }}
            aria-hidden
          />
          <div className="relative mx-auto max-w-6xl px-6 pb-16 pt-20 md:pb-20 md:pt-32">
            <p className="rise font-mono text-[11px] uppercase tracking-[0.24em] text-ice">
              Upload. Share. Get paid.
            </p>

            <h1 className="rise mt-6 font-display text-[clamp(2.4rem,8vw,5.4rem)] font-600 leading-[0.95] tracking-[-0.03em]">
              <SignalText text="Your files can" />
              <br />
              <span className="text-sodium">
                <SignalText text="pay you back." delay={280} />
              </span>
            </h1>

            <p className="rise mt-8 max-w-xl text-base leading-relaxed text-muted md:text-lg">
              Upload a file, share the link, and earn every time someone downloads it.
              No storage fees, no size limits worth mentioning, no waiting around —
              just an income stream from files you were sharing for free anyway.
            </p>

            <div className="rise mt-10 flex flex-wrap items-center gap-4">
              <Link
                href="/signup"
                className="border border-ice/50 bg-ice/10 px-6 py-3 font-mono text-xs uppercase tracking-[0.16em] text-ice transition-colors hover:bg-ice/20"
              >
                Start earning
              </Link>
              <Link
                href="/login"
                className="px-2 py-3 font-mono text-xs uppercase tracking-[0.16em] text-muted transition-colors hover:text-ink"
              >
                I already have an account
              </Link>
            </div>
          </div>
        </section>

        <TechStrip />

        {/* Signature element */}
        <section className="mx-auto max-w-6xl px-6 py-16 md:py-24">
          <div className="mb-10 flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-4">
            <h2 className="font-display text-2xl tracking-tight md:text-3xl">
              From upload to payout
            </h2>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
              Hover a stage
            </p>
          </div>
          <ProcessMap />
        </section>

        {/* Benefits, non-technical */}
        <section className="mx-auto max-w-6xl px-6 pb-8">
          <div className="grid gap-px overflow-hidden border border-line bg-line md:grid-cols-3">
            {[
              {
                icon: "upload",
                k: "No caps",
                t: "Upload what you actually have",
                d: "Videos, archives, whatever the file is — no arbitrary size limit standing between you and a share link.",
              },
              {
                icon: "wallet",
                k: "USDT / BTC",
                t: "Paid straight to your wallet",
                d: "Set a payout wallet once. Watch your balance grow with every download, request a payout when you're ready.",
              },
              {
                icon: "globe",
                k: "By region",
                t: "Rates that reflect real demand",
                d: "Downloads are worth more from some places than others. Pricing adjusts automatically — you don't have to think about it.",
              },
            ].map((c) => (
              <div key={c.t} className="bg-panel/70 p-7">
                <span className="text-ice">{ICONS[c.icon]}</span>
                <p className="mt-4 font-mono text-xs uppercase tracking-[0.16em] text-sodium">{c.k}</p>
                <h3 className="mt-2 font-display text-lg">{c.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{c.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* What downloads are actually worth, computed from real rate data.
            These own their section + heading so the whole thing disappears
            together if the backend has no rate data yet, rather than leaving
            an orphaned header over an empty grid. */}
        <EarningsExample />
        <RegionRates />

        {/* FAQ */}
        <section className="mx-auto max-w-4xl px-6 py-16 md:py-24">
          <h2 className="font-display text-2xl tracking-tight md:text-3xl">Questions</h2>
          <div className="mt-8">
            <Faq />
          </div>
        </section>

        {/* Final CTA + link to the technical detail page */}
        <section className="mx-auto max-w-6xl px-6 py-16 md:py-24">
          <div className="flex flex-col items-start justify-between gap-8 border-t border-line pt-12 md:flex-row md:items-end">
            <div className="max-w-xl">
              <h2 className="font-display text-2xl tracking-tight md:text-3xl">
                Your next upload could be your first payout.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                Takes a minute to set up. No account needed for the people you're
                sharing with — just for you, to get paid.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-5">
              <Link
                href="/signup"
                className="border border-ice/50 bg-ice/10 px-6 py-3 font-mono text-xs uppercase tracking-[0.16em] text-ice transition-colors hover:bg-ice/20"
              >
                Start earning
              </Link>
              <Link
                href="/how-it-works"
                className="font-mono text-xs uppercase tracking-[0.16em] text-muted transition-colors hover:text-ink"
              >
                See how it works
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
