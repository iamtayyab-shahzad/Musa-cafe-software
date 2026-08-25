import catalog from "./menu.json";
import { shop } from "@/lib/shop";
import type { Category, Offer, Product, Settings } from "@/types";

const now = "2026-07-19T00:00:00.000Z";
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

function sizeId(productId: string, index: number) {
  const serial = Number(productId.slice(-12));
  return `30000000-0000-4000-8000-${String(serial * 10 + index + 1).padStart(12, "0")}`;
}

export const menuCatalog = catalog;

export const pizzaCategoryIds = new Set(
  catalog.categories
    .filter((category) => category.slug.includes("pizza"))
    .map((category) => category.id),
);

export const krunchiesCategories: Category[] = catalog.categories.map(
  (category) => ({
    id: category.id,
    created_at: now,
    updated_at: now,
    name: category.name,
    image: category.image,
    display_order: category.displayOrder,
    visible: true,
  }),
);

export const krunchiesProducts: Product[] = catalog.products.map(
  (product, index) => {
    const category = categoryBySlug.get(product.category);
    if (!category) {
      throw new Error(`Missing category for ${product.name}`);
    }
    return {
      id: product.id,
      created_at: now,
      updated_at: now,
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
          created_at: now,
          updated_at: now,
          product_id: product.id,
          size: size.name,
          price: size.price,
          was_price: wasPrice > 0 ? wasPrice : undefined,
        };
      }),
    };
  },
);

export const krunchiesOffers: Offer[] = [
  ...promotions.map((promo) => ({
    id: promo.id,
    created_at: now,
    updated_at: now,
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
      const saveNote =
        save > 0
          ? ` Save ${catalog.restaurant.currency} ${save.toLocaleString("en-PK")}.`
          : "";
      return {
        id: `40000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        created_at: now,
        updated_at: now,
        title: deal.name,
        description: `${deal.description} — ${catalog.restaurant.currency} ${price.toLocaleString("en-PK")}.${saveNote}`,
        image: deal.image,
        active: true,
        discount_label:
          save > 0
            ? `Save Rs ${save.toLocaleString("en-PK")}`
            : deal.name,
      };
    }),
];

export const krunchiesSettings: Settings = {
  id: "60000000-0000-4000-8000-000000000001",
  created_at: now,
  updated_at: now,
  restaurant_name: catalog.restaurant.name,
  phone: [catalog.restaurant.phone, catalog.restaurant.alternatePhone]
    .filter(Boolean)
    .join(" / "),
  whatsapp: catalog.restaurant.whatsapp,
  logo: shop.logo,
  opening_time: catalog.restaurant.openingTime,
  closing_time: catalog.restaurant.closingTime,
  cash_on_delivery_fee: 50,
  currency: catalog.restaurant.currency,
  google_maps: "",
  facebook: "",
  instagram: "",
};
