/** Core POS screens load data client-side (RQ/IndexedDB) — static shell is enough. */
export const dynamic = "force-static";

export default function PendingOrdersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
