"use client";

import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const CTA_IMAGE =
  "https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?w=1600&q=80";

export function CallToAction() {
  return (
    <section className="relative overflow-hidden py-14 sm:py-24">
      <Image
        src={CTA_IMAGE}
        alt=""
        fill
        loading="lazy"
        quality={70}
        sizes="100vw"
        className="object-cover"
      />
      <div className="absolute inset-0 bg-black/80" />
      <div className="absolute inset-0 bg-gradient-to-r from-orange-600/30 to-transparent" />
      <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
        <h2 className="font-display text-3xl text-white sm:text-5xl">
          Hungry? Your next favorite pizza is a tap away.
        </h2>
        <p className="mt-3 text-sm text-zinc-300 sm:mt-4 sm:text-base">
          Browse the menu, customize your order, and get it delivered hot.
        </p>
        <Button asChild size="lg" className="mt-6 min-h-12 sm:mt-8">
          <Link href="/menu">Start Ordering</Link>
        </Button>
      </div>
    </section>
  );
}
