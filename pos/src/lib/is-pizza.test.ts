import { describe, expect, it } from "vitest";
import { isPizzaSizeLabel, pizzaSellableSizes } from "./is-pizza";

describe("pizzaSellableSizes", () => {
  it("hides Regular and Deal from pizza cards", () => {
    const sizes = pizzaSellableSizes([
      { size: "S", price: 650 },
      { size: "Regular", price: 650 },
      { size: "L", price: 1400 },
      { size: "Deal", price: 1 },
    ]);
    expect(sizes.map((s) => s.size)).toEqual(["S", "L"]);
  });

  it("accepts pizza labels only", () => {
    expect(isPizzaSizeLabel("XL")).toBe(true);
    expect(isPizzaSizeLabel("Regular")).toBe(false);
  });
});
