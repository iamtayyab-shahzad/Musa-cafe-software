/** Core POS screens load data client-side (RQ/IndexedDB) — static shell is enough. */
export const dynamic = "force-static";

export default function NewOrderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
