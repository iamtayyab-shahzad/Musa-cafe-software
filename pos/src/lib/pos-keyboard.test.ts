import { describe, expect, it } from "vitest";
import { moveGridIndex } from "@/lib/pos-keyboard";

describe("moveGridIndex", () => {
  it("moves within a 4-column grid", () => {
    expect(moveGridIndex(0, "ArrowRight", 10, 4)).toBe(1);
    expect(moveGridIndex(0, "ArrowDown", 10, 4)).toBe(4);
    expect(moveGridIndex(5, "ArrowUp", 10, 4)).toBe(1);
    expect(moveGridIndex(0, "ArrowLeft", 10, 4)).toBe(0);
    expect(moveGridIndex(9, "ArrowRight", 10, 4)).toBe(9);
  });

  it("starts at 0 when index was negative", () => {
    expect(moveGridIndex(-1, "ArrowRight", 5, 2)).toBe(0);
  });
});
