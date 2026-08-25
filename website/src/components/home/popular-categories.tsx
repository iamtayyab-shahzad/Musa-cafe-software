"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getCategories } from "@/services/api";
import { mediaUrl } from "@/lib/media";
import type { Category } from "@/types";

type PopularCategoriesProps = {
  initialCategories?: Category[];
};

export function PopularCategories({
  initialCategories = [],
}: PopularCategoriesProps) {
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [loading, setLoading] = useState(initialCategories.length === 0);

  useEffect(() => {
    if (initialCategories.length > 0) {
      return;
    }
    let active = true;
    getCategories()
      .then((rows) => {
        if (active) setCategories(rows);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [initialCategories.length]);

  return (
    <section className="border-y border-white/5 bg-zinc-950/80 py-12 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6 sm:mb-10">
          <p className="text-sm font-semibold uppercase tracking-widest text-orange-500">
            Browse
          </p>
          <h2 className="mt-2 font-display text-3xl text-white sm:text-5xl">
            Popular Categories
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-5">
          {loading && categories.length === 0
            ? Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-square animate-pulse rounded-xl bg-zinc-900"
                />
              ))
            : categories.map((cat) => (
                <Link
                  key={cat.id}
                  href={`/menu?category=${cat.id}`}
                  className="group relative block aspect-square overflow-hidden rounded-xl"
                >
                  <Image
                    src={mediaUrl(cat.image, { width: 400 })}
                    alt={cat.name}
                    fill
                    className="object-cover sm:transition-transform sm:duration-500 sm:group-hover:scale-110"
                    sizes="(max-width: 768px) 50vw, 20vw"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                  <p className="absolute bottom-3 left-3 font-display text-lg text-white sm:bottom-4 sm:left-4 sm:text-xl">
                    {cat.name}
                  </p>
                </Link>
              ))}
        </div>
      </div>
    </section>
  );
}
