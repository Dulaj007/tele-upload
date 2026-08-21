export default function Legal({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-20">
      <h1 className="font-display text-4xl tracking-tight">{title}</h1>
      <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.16em] text-sodium">
        {updated}
      </p>
      <div
        className="mt-12 space-y-6 text-sm leading-relaxed text-muted
                   [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-lg [&_h2]:text-ink
                   [&_li]:mb-1.5 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5"
      >
        {children}
      </div>
    </main>
  );
}
