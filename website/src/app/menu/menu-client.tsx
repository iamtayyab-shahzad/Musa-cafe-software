"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ProductCard } from "@/components/menu/product-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/i18n/locale-context";
import { translateCategoryName } from "@/i18n/messages";
import { cn } from "@/lib/utils";
import {
  clearCatalogCache,
  getCategories,
  getProducts,
} from "@/services/api";
import type { Category, Product } from "@/types";

type MenuClientProps = {
  initialCategories?: Category[];
  initialProducts?: Product[];
};

export default function MenuClient({
  initialCategories = [],
  initialProducts = [],
}: MenuClientProps) {
  const { t, locale } = useLocale();
  const searchParams = useSearchParams();
  const initialCategory = searchParams.get("category") ?? "all";

  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [categoryId, setCategoryId] = useState(initialCategory);
  const [search, setSearch] = useState("");
  const [sizeFilter, setSizeFilter] = useState<"all" | "pizza" | "other">("all");
  const [loading, setLoading] = useState(initialProducts.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const categoryById = useMemo(() => {
    const map = new Map<string, Category>();
    for (const c of categories) map.set(c.id, c);
    return map;
  }, [categories]);

  const pizzaCategoryIds = useMemo(
    () =>
      new Set(
        categories
          .filter((c) => c.name.toLowerCase().includes("pizza"))
          .map((c) => c.id),
      ),
    [categories],
  );

  const sortedCategories = useMemo(() => {
    return [...categories].sort((a, b) => {
      const order = (a.display_order || 0) - (b.display_order || 0);
      if (order !== 0) return order;
      return a.name.localeCompare(b.name);
    });
  }, [categories]);

  useEffect(() => {
    // Server already hydrated a full catalog — skip the first client fetch.
    if (reloadKey === 0 && initialProducts.length > 0) {
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([getCategories(), getProducts()])
      .then(([cats, items]) => {
        if (!active) return;
        setCategories(cats);
        setProducts(items);
        if (!items.length) {
          setError(t("menu_unavailable"));
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof Error ? err.message : t("menu_unavailable"),
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadKey, initialProducts.length, t]);

  const retry = useCallback(() => {
    clearCatalogCache();
    setReloadKey((k) => k + 1);
  }, []);

  const selectCategory = useCallback((id: string) => {
    setCategoryId(id);
    // All/Pizzas/Other only apply on All Items — reset when leaving.
    if (id !== "all") setSizeFilter("all");
  }, []);

  const filtered = useMemo(() => {
    let result = products;
    if (categoryId !== "all") {
      result = result.filter((p) => p.category_id === categoryId);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description || "").toLowerCase().includes(q),
      );
    }
    if (categoryId === "all") {
      if (sizeFilter === "pizza") {
        result = result.filter((p) => pizzaCategoryIds.has(p.category_id));
      } else if (sizeFilter === "other") {
        result = result.filter((p) => !pizzaCategoryIds.has(p.category_id));
      }
      result = [...result].sort((a, b) => {
        const ca = categoryById.get(a.category_id);
        const cb = categoryById.get(b.category_id);
        const da = ca?.display_order ?? 0;
        const db = cb?.display_order ?? 0;
        if (da !== db) return da - db;
        return (a.display_order || 0) - (b.display_order || 0);
      });
    }
    return result;
  }, [
    products,
    categoryId,
    search,
    sizeFilter,
    pizzaCategoryIds,
    categoryById,
  ]);

  const categoryButtons = (
    <>
      <button
        type="button"
        onClick={() => selectCategory("all")}
        className={cn(
          "shrink-0 rounded-full px-4 py-2.5 text-sm font-medium transition-colors lg:block lg:w-full lg:rounded-md lg:px-3 lg:py-2 lg:text-left",
          locale === "ur" && "lg:text-right font-urdu text-base",
          categoryId === "all"
            ? "bg-orange-500 text-black lg:bg-orange-500/15 lg:text-orange-400"
            : "bg-zinc-900 text-zinc-300 lg:bg-transparent lg:text-zinc-400 lg:hover:bg-zinc-900 lg:hover:text-white",
        )}
      >
        {t("menu_all_items")}
      </button>
      {sortedCategories.map((cat) => (
        <button
          key={cat.id}
          type="button"
          onClick={() => selectCategory(cat.id)}
          className={cn(
            "shrink-0 rounded-full px-4 py-2.5 text-sm font-medium transition-colors lg:block lg:w-full lg:rounded-md lg:px-3 lg:py-2 lg:text-left",
            locale === "ur" && "lg:text-right font-urdu text-base",
            categoryId === cat.id
              ? "bg-orange-500 text-black lg:bg-orange-500/15 lg:text-orange-400"
              : "bg-zinc-900 text-zinc-300 lg:bg-transparent lg:text-zinc-400 lg:hover:bg-zinc-900 lg:hover:text-white",
          )}
        >
          {translateCategoryName(cat.name, locale)}
        </button>
      ))}
    </>
  );

  const showBrowseFilters = categoryId === "all";

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <div className="mb-5 sm:mb-8">
        <h1
          className={cn(
            "font-display text-4xl text-white sm:text-5xl",
            locale === "ur" && "font-urdu text-5xl leading-relaxed",
          )}
        >
          {t("menu_title")}
        </h1>
        <p
          className={cn(
            "mt-2 hidden text-zinc-400 sm:block",
            locale === "ur" && "font-urdu text-base leading-loose",
          )}
        >
          {t("menu_subtitle")}
        </p>
      </div>

      <div className="sticky top-14 z-30 -mx-4 mb-4 border-b border-zinc-900 bg-black/95 px-4 py-3 backdrop-blur-sm sm:top-16 lg:hidden">
        <div className="-mx-1 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {categoryButtons}
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
        <aside className="hidden h-fit space-y-2 lg:sticky lg:top-24 lg:block">
          <p
            className={cn(
              "mb-3 text-xs font-semibold uppercase tracking-wider text-orange-500",
              locale === "ur" && "font-urdu text-sm tracking-normal",
            )}
          >
            {t("menu_categories")}
          </p>
          {categoryButtons}
        </aside>

        <div>
          <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row">
            <Input
              placeholder={t("menu_search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(
                "min-h-11 sm:max-w-xs",
                locale === "ur" && "font-urdu text-base",
              )}
            />
            {showBrowseFilters ? (
              <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {(
                  [
                    ["all", t("menu_filter_all")],
                    ["pizza", t("menu_filter_pizzas")],
                    ["other", t("menu_filter_other")],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSizeFilter(value)}
                    className={cn(
                      "min-h-11 shrink-0 rounded-md border px-3 py-2 text-sm",
                      locale === "ur" && "font-urdu text-base",
                      sizeFilter === value
                        ? "border-orange-500 text-orange-400"
                        : "border-zinc-700 text-zinc-400",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {loading && products.length === 0 ? (
            <div className="grid gap-3 sm:gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-28 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900/70 sm:h-72"
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-8 text-center">
              <p
                className={cn(
                  "text-zinc-400",
                  locale === "ur" && "font-urdu text-base leading-relaxed",
                )}
              >
                {error || t("menu_empty")}
              </p>
              <Button className="mt-4" onClick={retry} variant="outline">
                {t("menu_retry")}
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 sm:gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
