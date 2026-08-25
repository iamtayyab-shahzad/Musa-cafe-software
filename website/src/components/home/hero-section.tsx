import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { restaurant } from "@/data/krunchies";
import { shopDisplayParts } from "@/lib/shop";

const HERO_IMAGE =
  "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=1600&q=80";

export function HeroSection() {
  const parts = shopDisplayParts();
  return (
    <section className="relative min-h-[85svh] overflow-hidden sm:min-h-[100svh]">
      <Image
        src={HERO_IMAGE}
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black via-black/85 to-black/40" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(249,115,22,0.25),transparent_50%)]" />

      <div className="relative mx-auto flex min-h-[85svh] max-w-7xl flex-col justify-center px-4 py-16 sm:min-h-[100svh] sm:px-6 sm:py-24 lg:px-8">
        <p className="font-display text-4xl text-white sm:text-7xl md:text-8xl">
          <span className="text-orange-500">{parts.accent}</span>
          {parts.rest ? (
            <>
              <br />
              {parts.rest}
            </>
          ) : null}
        </p>
        <h1 className="mt-4 max-w-xl text-base font-medium uppercase tracking-[0.14em] text-zinc-200 sm:mt-6 sm:text-2xl sm:tracking-[0.18em]">
          {restaurant.tagline}
        </h1>
        <p className="mt-3 max-w-md text-sm text-zinc-400 sm:mt-4 sm:text-base">
          {restaurant.deliveryNote}. Open daily {restaurant.openingTime}–
          {restaurant.closingTime}.
        </p>
        <div className="mt-8 flex flex-wrap gap-3 sm:mt-10 sm:gap-4">
          <Button asChild size="lg" className="min-h-12 min-w-[8.5rem]">
            <Link href="/menu">Order Now</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="min-h-12">
            <Link href="/about">Our Story</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
