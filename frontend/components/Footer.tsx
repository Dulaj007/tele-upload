import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-24 border-t border-line/70">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
        <p className="font-mono uppercase tracking-[0.16em]">Tele Upload — upload files, get paid</p>
        <div className="flex gap-6">
          <Link href="/how-it-works" className="transition-colors hover:text-ink">How it works</Link>
          <Link href="/contact" className="transition-colors hover:text-ink">Contact</Link>
          <Link href="/terms" className="transition-colors hover:text-ink">Terms</Link>
          <Link href="/privacy" className="transition-colors hover:text-ink">Privacy</Link>
        </div>
      </div>
    </footer>
  );
}
