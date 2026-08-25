import catalog from "./menu.json";
import { shop } from "@/lib/shop";
import type {
  Category,
  Location,
  Offer,
  Product,
  Review,
  Settings,
} from "@/types";

type MenuPromo = {
  id: string;
  title: string;
  description: string;
  image: string;
  active: boolean;
  startDate: string;
  endDate: string;
};

const promotions = catalog.promotions as MenuPromo[];

const categoryBySlug = new Map(
  catalog.categories.map((category) => [category.slug, category]),
);

export const menuCatalog = catalog;

export const pizzaCategoryIds = new Set(
  catalog.categories
    .filter((category) => category.slug.includes("pizza"))
    .map((category) => category.id),
);

function sizeId(productId: string, index: number) {
  const serial = Number(productId.slice(-12));
  return `30000000-0000-4000-8000-${String(serial * 10 + index + 1).padStart(12, "0")}`;
}

const phoneLine = [catalog.restaurant.phone, catalog.restaurant.alternatePhone]
  .filter(Boolean)
  .join(" · ");

export const restaurant = catalog.restaurant;

export const settings: Settings = {
  restaurant_name: catalog.restaurant.name,
  phone: catalog.restaurant.phone,
  whatsapp: catalog.restaurant.whatsapp,
  logo: shop.logo,
  opening_time: catalog.restaurant.openingTime,
  closing_time: catalog.restaurant.closingTime,
  cash_on_delivery_fee: 50,
  currency: catalog.restaurant.currency,
  google_maps: "",
  facebook: "",
  instagram: "",
  address: catalog.restaurant.deliveryNote || catalog.restaurant.name,
  email: "",
};

export const categories: Category[] = catalog.categories.map((category) => ({
  id: category.id,
  name: category.name,
  image: category.image,
  display_order: category.displayOrder,
  visible: true,
}));

export const products: Product[] = catalog.products.map((product, index) => {
  const category = categoryBySlug.get(product.category);
  if (!category) {
    throw new Error(`Missing category for ${product.name}`);
  }
  return {
    id: product.id,
    category_id: category.id,
    name: product.name,
    description: product.description,
    image: product.image,
    featured: product.featured,
    available: true,
    allow_manual_price: Boolean(
      "allowManualPrice" in product && product.allowManualPrice,
    ),
    display_order: index + 1,
    sizes: product.sizes.map((size, sizeIndex) => {
      const wasPrice =
        "wasPrice" in size && typeof size.wasPrice === "number"
          ? size.wasPrice
          : 0;
      return {
        id: sizeId(product.id, sizeIndex),
        product_id: product.id,
        size: size.name,
        price: size.price,
        was_price: wasPrice > 0 ? wasPrice : undefined,
      };
    }),
  };
});

export const offers: Offer[] = [
  ...promotions.map((promo) => ({
    id: promo.id,
    title: promo.title,
    description: promo.description,
    image: promo.image,
    active: promo.active,
    start_date: promo.startDate,
    end_date: promo.endDate,
  })),
  ...catalog.products
    .filter((product) => product.category === "deals")
    .map((deal, index) => {
      const price = deal.sizes[0]?.price ?? 0;
      const wasPrice =
        deal.sizes[0] &&
        "wasPrice" in deal.sizes[0] &&
        typeof deal.sizes[0].wasPrice === "number"
          ? deal.sizes[0].wasPrice
          : 0;
      const save = wasPrice > price ? wasPrice - price : 0;
      const priceLabel = `${catalog.restaurant.currency} ${price.toLocaleString("en-PK")}`;
      const title =
        save > 0
          ? `${deal.name} — ${priceLabel} (Save ${catalog.restaurant.currency} ${save.toLocaleString("en-PK")})`
          : `${deal.name} — ${priceLabel}`;
      return {
        id: `40000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        title,
        description: deal.description,
        image: deal.image,
        active: true,
      };
    }),
];

// The printed menu confirms delivery but does not publish a street address.
export const locations: Location[] = catalog.locations.map((loc) => ({
  id: loc.id,
  name: loc.name,
  delivery_charge: loc.deliveryCharge,
}));

export const reviews: Review[] = [
  {
    id: "review-1",
    name: "Local Customer",
    rating: 5,
    comment: "Fresh food, generous portions, and great value.",
  },
  {
    id: "review-2",
    name: "Family Customer",
    rating: 5,
    comment: "Pizza deals and Musa Special Sandwich are favorites.",
  },
  {
    id: "review-3",
    name: "Regular",
    rating: 5,
    comment: phoneLine
      ? `Call ${phoneLine} between ${catalog.restaurant.openingTime} and ${catalog.restaurant.closingTime}.`
      : `Open daily ${catalog.restaurant.openingTime}–${catalog.restaurant.closingTime}.`,
  },
];
