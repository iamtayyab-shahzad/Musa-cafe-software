import { redirect } from "next/navigation";

/** Purchases UI removed — stock buys happen on Inventory. */
export default function PurchasesRedirectPage() {
  redirect("/inventory");
}
