"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError, formatBytes } from "@/lib/api";

type FileRow = {
  slug: string;
  name: string;
  stored_name: string;
  size_bytes: number;
  kind: string;
  download_count: number;
  created_at: string;
  share_url: string;
};

export default function DashboardPage() {
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [files, setFiles] = useState<FileRow[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    api<{ handle: string; total: number; files: FileRow[] }>("/files")
      .then((d) => {
        setHandle(d.handle);
        setFiles(d.files);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) router.push("/login");
        else setFiles([]);
      });
  }, [router]);

  async function copy(url: string, slug: string) {
    await navigator.clipboard.writeText(url);
    setCopied(slug);
    window.setTimeout(() => setCopied(null), 1600);
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-line pb-5">
          <div>
            <h1 className="font-display text-3xl tracking-tight">Your files</h1>
            {handle && <p className="mt-1 font-mono text-xs text-muted">{handle}</p>}
          </div>
          <Link
            href="/upload"
            className="border border-ice/50 bg-ice/10 px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.16em] text-ice transition-colors hover:bg-ice/20"
          >
            Add a file
          </Link>
        </div>

        {files === null && (
          <p className="mt-10 font-mono text-xs uppercase tracking-[0.16em] text-muted">Loading…</p>
        )}

        {files !== null && files.length === 0 && (
          <div className="mt-16 border border-dashed border-line px-8 py-16 text-center">
            <h2 className="font-display text-xl">Nothing here yet</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
              Files arrive through the bot, not this page. Open it, press upload, send
              a file, and it appears here.
            </p>
            <Link
              href="/upload"
              className="mt-7 inline-block border border-ice/50 bg-ice/10 px-6 py-3 font-mono text-[11px] uppercase tracking-[0.16em] text-ice"
            >
              Open the bot
            </Link>
          </div>
        )}

        {files !== null && files.length > 0 && (
          <ul className="mt-8 divide-y divide-line border-y border-line">
            {files.map((f) => (
              <li key={f.slug} className="flex flex-wrap items-center gap-4 py-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{f.name}</p>
                  <p className="mt-1 font-mono text-[11px] text-muted">
                    {formatBytes(f.size_bytes)} · {f.download_count} downloads ·{" "}
                    <span className="text-ice/70">/d/{f.slug}</span>
                  </p>
                </div>
                <button
                  onClick={() => copy(f.share_url, f.slug)}
                  className="border border-line px-4 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted transition-colors hover:border-ice/50 hover:text-ice"
                >
                  {copied === f.slug ? "Copied" : "Copy link"}
                </button>
              </li>
            ))}
          </ul>
        )}
    </main>
  );
}
