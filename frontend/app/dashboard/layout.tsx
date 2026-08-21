"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Footer from "@/components/Footer";
import Nav from "@/components/Nav";
import { api, ApiError } from "@/lib/api";

const TABS = [
  { href: "/dashboard", label: "Files" },
  { href: "/dashboard/earnings", label: "Earnings" },
  { href: "/dashboard/payouts", label: "Payouts" },
  { href: "/dashboard/payment-methods", label: "Payment methods" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  // Gates every page under /dashboard, not just this one -- signed-out
  // visitors never see the shell or any child page's data.
  useEffect(() => {
    api("/files/me")
      .then(() => setReady(true))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) router.push("/login");
        else setReady(true);
      });
  }, [router]);

  if (!ready) return null;

  return (
    <>
      <Nav />
      <div className="mx-auto max-w-5xl px-6 pt-8">
        <nav className="flex gap-6 overflow-x-auto whitespace-nowrap border-b border-line font-mono text-[11px] uppercase tracking-[0.16em]">
          {TABS.map((t) => {
            const active = pathname === t.href;
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`shrink-0 border-b-2 px-1 pb-3 transition-colors ${
                  active ? "border-ice text-ice" : "border-transparent text-muted hover:text-ink"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
      {children}
      <Footer />
    </>
  );
}
