import { AppShell } from "@/components/layout/app-shell";

export default function PosGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
