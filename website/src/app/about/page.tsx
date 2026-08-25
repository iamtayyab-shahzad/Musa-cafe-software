import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SITE_NAME } from "@/lib/constants";
import { pageSeo } from "@/lib/seo";

export const metadata: Metadata = pageSeo({
  title: `About ${SITE_NAME}`,
  description: `Learn the story behind ${SITE_NAME} — pizza, burgers, shawarma, pasta, broast, and family deals in Musa Khel.`,
  path: "/about",
  absoluteTitle: true,
});

const ABOUT_HERO =
  "https://images.unsplash.com/photo-1550547660-d9450f859349?w=1600&q=80";

export default function AboutPage() {
  return (
    <div>
      <section className="relative min-h-[50vh] overflow-hidden">
        <Image
          src={ABOUT_HERO}
          alt=""
          fill
          priority
          quality={70}
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-black/75" />
        <div className="relative mx-auto flex min-h-[50vh] max-w-7xl items-end px-4 pb-16 sm:px-6 lg:px-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-orange-500">
              About Us
            </p>
            <h1 className="mt-2 font-display text-6xl text-white sm:text-7xl">
              {SITE_NAME}
            </h1>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <h2 className="font-display text-4xl text-white">
          Taste with quality in Musa Khel
        </h2>
        <div className="mt-6 space-y-4 text-zinc-400 leading-relaxed">
          <p>
            {SITE_NAME} is your local kitchen at Waan Wala Pul for pizza,
            burgers, shawarma, wraps, pasta, broast, shakes and family deals —
            made to order with express delivery.
          </p>
          <p>
            Walk in or call for delivery. Counter and online orders share the
            same menu and kitchen.
          </p>
        </div>
        <Button asChild className="mt-10">
          <Link href="/menu">Explore the Menu</Link>
        </Button>
      </section>
    </div>
  );
}
