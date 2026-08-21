import PanelShell from "@/components/admin/PanelShell";

export const metadata = {
  robots: { index: false, follow: false },
};

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return <PanelShell>{children}</PanelShell>;
}
