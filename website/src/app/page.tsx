import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { HeroSection } from "@/components/home/hero-section";
import { OfferPopup } from "@/components/home/offer-popup";
import { FeaturedProducts } from "@/components/home/featured-products";
import { PopularCategories } from "@/components/home/popular-categories";
import { SITE_NAME } from "@/lib/constants";
import { pageSeo } from "@/lib/seo";
import { getCategories, getProducts } from "@/services/api";
import type { Category, Product } from "@/types";

const RestaurantStory = dynamic(() =>
  import("@/components/home/restaurant-story").then((m) => ({
    default: m.RestaurantStory,
  })),
);
const CustomerReviews = dynamic(() =>
  import("@/components/home/customer-reviews").then((m) => ({
    default: m.CustomerReviews,
  })),
);
const CallToAction = dynamic(() =>
  import("@/components/home/call-to-action").then((m) => ({
    default: m.CallToAction,
  })),
);

export const metadata: Metadata = pageSeo({
  title: `${SITE_NAME} | Pizza, Burgers & Fast Food`,
  description: `Order pizza, burgers, pasta, broast and deals from ${SITE_NAME}. Fast food and takeaway.`,
  path: "/",
  absoluteTitle: true,
});

/** Same ISR window as /menu so home catalog is in the HTML, not a client fetch. */
export const revalidate = 60;

async function loadHomeCatalog(): Promise<{
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

export default async function HomePage() {
  const { categories, products } = await loadHomeCatalog();
  const featured = products.filter((p) => p.featured);

  return (
    <>
      <HeroSection />
      <OfferPopup />
      <FeaturedProducts initialProducts={featured} />
      <PopularCategories initialCategories={categories} />
      <RestaurantStory />
      <CustomerReviews />
      <CallToAction />
    </>
  );
}
