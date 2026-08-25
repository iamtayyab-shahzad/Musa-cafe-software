import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  closePosDbForTests,
  listLocalInventory,
  mergeInventory,
  replaceInventory,
} from "@/lib/offline-db";
import type { InventoryItem } from "@/types";

const DB_NAME = "krunchies-pos";

function item(
  partial: Partial<InventoryItem> & Pick<InventoryItem, "id" | "name" | "stock">,
): InventoryItem {
  const now = "2026-08-17T10:00:00.000Z";
  return {
    created_at: now,
    updated_at: now,
    unit: "g",
    purchase_price: 0,
    minimum_stock: 0,
    ...partial,
  };
}

async function deleteDb() {
  await closePosDbForTests();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

beforeEach(async () => {
  await deleteDb();
});

afterEach(async () => {
  await deleteDb();
});

describe("mergeInventory incremental sync", () => {
  it("empty delta does not wipe existing inventory", async () => {
    await replaceInventory([
      item({ id: "a", name: "Cheese", stock: 1000 }),
      item({ id: "b", name: "Dough", stock: 500 }),
    ]);
    await mergeInventory([]);
    const rows = await listLocalInventory();
    expect(rows).toHaveLength(2);
  });

  it("upserts changed rows only", async () => {
    await replaceInventory([
      item({ id: "a", name: "Cheese", stock: 1000 }),
      item({ id: "b", name: "Dough", stock: 500 }),
    ]);
    await mergeInventory([item({ id: "a", name: "Cheese", stock: 900 })]);
    const rows = await listLocalInventory();
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === "a")?.stock).toBe(900);
    expect(rows.find((r) => r.id === "b")?.stock).toBe(500);
  });
});
