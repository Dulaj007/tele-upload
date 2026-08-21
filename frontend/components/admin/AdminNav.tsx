"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";

const TABS = [
  { href: "/console/overview", label: "Overview" },
  { href: "/console/users", label: "Users" },
  { href: "/console/files", label: "Files" },
  { href: "/console/payout-methods", label: "Payout methods" },
  { href: "/console/contact", label: "Contact" },
  { href: "/console/reports", label: "Reports" },
];

export default function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await api("/admin/logout", { method: "POST" }).catch(() => {});
    router.push("/");
  }

  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <p className="font-display text-lg tracking-tight">
          Tele Upload <span className="text-muted">/ admin</span>
        </p>
        <button
          onClick={logout}
          className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted transition-colors hover:text-ink"
        >
          Log out
        </button>
      </div>
      <nav className="mx-auto flex max-w-6xl gap-6 overflow-x-auto whitespace-nowrap px-6 font-mono text-[11px] uppercase tracking-[0.16em]">
        {TABS.map((t) => {
          const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`shrink-0 border-b-2 py-3 transition-colors ${
                active ? "border-ice text-ice" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
