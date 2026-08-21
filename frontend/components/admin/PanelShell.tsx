"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import AdminNav from "./AdminNav";

/*
  Auth check for everything under /console/(panel). Redirects to "/" on a
  confirmed 401 -- not back to the hidden login path, which isn't in scope
  here on purpose (the token never reaches client code). An already-signed-in
  admin just re-visits their bookmarked secret URL.
*/
export default function PanelShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api("/admin/me")
      .then(() => setReady(true))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) router.push("/");
        else setReady(true);
      });
  }, [router]);

  if (!ready) return null;

  return (
    <>
      <AdminNav />
      {children}
    </>
  );
}
