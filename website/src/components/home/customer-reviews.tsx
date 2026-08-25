import { Star } from "lucide-react";
import { reviews } from "@/data/krunchies";

export function CustomerReviews() {
  return (
    <section className="border-y border-white/5 bg-zinc-950/80 py-12 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6 text-center sm:mb-10">
          <p className="text-sm font-semibold uppercase tracking-widest text-orange-500">
            Testimonials
          </p>
          <h2 className="mt-2 font-display text-3xl text-white sm:text-5xl">
            Customer Reviews
          </h2>
        </div>
        <div className="grid gap-4 sm:gap-6 md:grid-cols-3">
          {reviews.map((review) => (
            <blockquote
              key={review.id}
              className="rounded-xl border border-zinc-800 bg-black/40 p-5 sm:p-6"
            >
              <div className="mb-3 flex gap-1">
                {Array.from({ length: review.rating }).map((_, idx) => (
                  <Star
                    key={idx}
                    className="h-4 w-4 fill-orange-500 text-orange-500"
                  />
                ))}
              </div>
              <p className="text-sm leading-relaxed text-zinc-300">
                “{review.comment}”
              </p>
              <footer className="mt-4 text-sm font-semibold text-white">
                {review.name}
              </footer>
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}
