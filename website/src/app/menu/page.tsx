import type { Metadata } from "next";
import { Suspense } from "react";
import MenuClient from "./menu-client";
import { SITE_NAME } from "@/lib/constants";
import { pageSeo } from "@/lib/seo";
import { getCategories, getProducts } from "@/services/api";
import type { Category, Product } from "@/types";

export const metadata: Metadata = pageSeo({
  title: `${SITE_NAME} Menu | Pizza, Burgers, Deals & More`,
  description:
    `Browse the full ${SITE_NAME} menu — pizzas, burgers, rolls, pasta, fries, broast, and family deals.`,
  path: "/menu",
  absoluteTitle: true,
});

/** Revalidate catalog periodically so menu stays fresh without a cold client fetch. */
export const revalidate = 60;

async function loadMenuCatalog(): Promise<{
  categories: Category[];
  products: Product[];
}> {
  try {
    const [categories, products] = await Promise.all([
      getCategories(),
      getProducts(),
    ]);
    return { categories, products };
  } catch {
    return { categories: [], products: [] };
  }
}

export default async function MenuPage() {
  const { categories, products } = await loadMenuCatalog();

  return (
    <Suspense
      fallback={<div className="p-10 text-zinc-500">Loading menu...</div>}
    >
      <MenuClient
        initialCategories={categories}
        initialProducts={products}
      />
    </Suspense>
  );
}
