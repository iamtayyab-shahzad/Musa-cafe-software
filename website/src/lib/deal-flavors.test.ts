import { describe, expect, it } from "vitest";
import type { Product } from "@/types";
import { menuCatalog } from "@/data/krunchies";
import {
  flavorsForSlot,
  isDealProduct,
  normalizeSize,
  parseDealPizzaSlots,
} from "./deal-flavors";

const STANDARD_PIZZA_CATEGORY_ID =
  menuCatalog.categories.find((c) => c.slug === "standard-pizza")?.id || "";

function makeProduct(
  id: string,
  categoryName: string,
  sizes: string[],
): Product {
  return {
    id,
    name: `Product ${id}`,
    description: "",
    image: "",
    category: { id: `cat-${categoryName}`, name: categoryName } as Product["category"],
    sizes: sizes.map((s, i) => ({
      id: `${id}-size-${i}`,
      product_id: id,
      size: s,
      price: 100,
    })),
  } as Product;
}

describe("parseDealPizzaSlots", () => {
  it("returns one slot for a single medium pizza", () => {
    const slots = parseDealPizzaSlots("2 Medium Pizza, 1 Fries, 1 Drink");
    expect(slots).toHaveLength(2);
    expect(slots.every((s) => s.size === "M")).toBe(true);
    expect(slots.every((s) => s.tier === "regular")).toBe(true);
  });

  it("parses large pizzas", () => {
    const slots = parseDealPizzaSlots("1 Large Pizza with drinks");
    expect(slots).toHaveLength(1);
    expect(slots[0].size).toBe("L");
    expect(slots[0].tier).toBe("regular");
  });

  it("parses XL Special pizzas as special tier", () => {
    const slots = parseDealPizzaSlots("1 XL Pizza Special");
    expect(slots).toHaveLength(1);
    expect(slots[0].size).toBe("XL");
    expect(slots[0].tier).toBe("special");
  });

  it("handles multiple sizes across a description", () => {
    const slots = parseDealPizzaSlots("1 Large Pizza and 2 Small Pizzas");
    expect(slots.map((s) => s.size)).toEqual(["L", "S", "S"]);
  });

  it("returns no slots when there is no pizza", () => {
    expect(parseDealPizzaSlots("2 Burgers, 5 Wings, 1 Drink")).toHaveLength(0);
  });
});

describe("normalizeSize", () => {
  it("maps words and codes to size codes", () => {
    expect(normalizeSize("Medium")).toBe("M");
    expect(normalizeSize("l")).toBe("L");
    expect(normalizeSize("Extra Large")).toBe("XL");
    expect(normalizeSize("random")).toBeNull();
  });
});

describe("isDealProduct", () => {
  it("detects products in a Deal category", () => {
    expect(isDealProduct(makeProduct("1", "Deals", ["L"]))).toBe(true);
    expect(isDealProduct(makeProduct("2", "Pizza (Regular Flavour)", ["M"]))).toBe(
      false,
    );
  });
});

describe("flavorsForSlot", () => {
  const products: Product[] = [
    makeProduct("a", "Pizza (Regular Flavour)", ["S", "M", "L"]),
    makeProduct("b", "Pizza (Regular Flavour)", ["M"]),
    makeProduct("c", "Pizza (Regular Flavour)", ["XL"]),
    makeProduct("d", "Special Pizza", ["M", "XL"]),
    makeProduct("e", "Krunchies Special Pizza", ["XL"]),
    makeProduct("f", "Special Burger", ["XL"]),
    makeProduct("g", "Deals", ["M"]),
  ];

  it("only returns Regular flavours matching the slot size", () => {
    const medium = flavorsForSlot(products, {
      id: "pizza-1",
      label: "Regular pizza flavor 1 (M)",
      size: "M",
      tier: "regular",
    });
    expect(medium.map((p) => p.id).sort()).toEqual(["a", "b"]);
  });

  it("returns Special pizza flavours for special tier", () => {
    const special = flavorsForSlot(products, {
      id: "pizza-1",
      label: "Special pizza flavor 1 (XL)",
      size: "XL",
      tier: "special",
    });
    expect(special.map((p) => p.id).sort()).toEqual(["d", "e"]);
  });

  it("excludes non-regular categories even when the size matches", () => {
    const result = flavorsForSlot(products, {
      id: "pizza-1",
      label: "flavor",
      size: "M",
      tier: "regular",
    });
    expect(result.some((p) => p.id === "d")).toBe(false);
    expect(result.some((p) => p.id === "g")).toBe(false);
  });

  it("returns nothing when no regular flavour has the size", () => {
    const result = flavorsForSlot(
      [makeProduct("x", "Pizza (Regular Flavour)", ["L"])],
      { id: "pizza-1", label: "flavor", size: "XL", tier: "regular" },
    );
    expect(result).toHaveLength(0);
  });

  it("matches Regular pizzas by category_id when category name is missing", () => {
    expect(STANDARD_PIZZA_CATEGORY_ID).toBeTruthy();
    const bare = {
      id: "bare-l",
      category_id: STANDARD_PIZZA_CATEGORY_ID,
      name: "Chicken Tika",
      description: "",
      image: "",
      featured: false,
      available: true,
      display_order: 1,
      sizes: [{ id: "s1", product_id: "bare-l", size: "L", price: 1400 }],
    } as Product;
    const large = flavorsForSlot([bare], {
      id: "pizza-1",
      label: "Regular pizza flavor 1 (L)",
      size: "L",
      tier: "regular",
    });
    expect(large.map((p) => p.id)).toEqual(["bare-l"]);
  });
});
