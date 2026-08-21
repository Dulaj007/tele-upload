const STACK = ["Next.js 14", "FastAPI", "PostgreSQL", "Telegram Bot API", "TypeScript"];

export default function TechStrip() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 border-y border-line py-8 font-mono text-xs uppercase tracking-[0.16em] text-muted">
      {STACK.map((s) => (
        <span key={s} className="text-ink">
          {s}
        </span>
      ))}
    </div>
  );
}
