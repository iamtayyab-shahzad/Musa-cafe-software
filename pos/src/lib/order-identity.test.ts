import { describe, expect, it } from "vitest";
import {
  dedupeOrdersByIdentity,
  ordersShareIdentity,
  preferEarlierCreatedAt,
  preferOrder,
  reconcilePendingOrders,
} from "@/lib/order-identity";
import type { Order } from "@/types";

function order( partial: Partial<Order> & Pick<Order, "id" | "order_status">): Order {
  const now = "2026-08-06T10:00:00.000Z";
  return {
    created_at: now,
    updated_at: now,
    order_number: partial.order_number || `ORD-${partial.id.slice(0, 6)}`,
    customer_name: partial.customer_name || "Test",
    phone: partial.phone || "03001234567",
    address: "",
    location_id: "loc",
    delivery_charge: 0,
    cash_on_delivery_fee: 0,
    payment_method: "cash",
    order_type: "walkin",
    order_notes: "",
    subtotal: 500,
    discount: 0,
    grand_total: 500,
    items: [],
    sync_status: "synced",
    ...partial,
  };
}

describe("order identity", () => {
  it("matches client UUID to server row via client_order_id", () => {
    const local = order({
      id: "client-1",
      client_order_id: "client-1",
      order_number: "LOCAL-CLIENT",
      order_status: "PENDING",
      sync_status: "pending_sync",
    });
    const server = order({
      id: "server-1",
      client_order_id: "client-1",
      order_status: "PENDING",
    });
    expect(ordersShareIdentity(local, server)).toBe(true);
  });

  it("keeps the earlier created_at when sync stamps a later time", () => {
    expect(
      preferEarlierCreatedAt(
        "2026-08-08T12:00:00.000Z",
        "2026-08-11T09:00:00.000Z",
      ),
    ).toBe("2026-08-08T12:00:00.000Z");
  });

  it("prefers COMPLETED over PENDING for the same ticket", () => {
    const pending = order({ id: "server-1", order_status: "PENDING" });
    const completed = order({
      id: "client-1",
      client_order_id: "client-1",
      order_status: "COMPLETED",
      sync_status: "pending_sync",
    });
    expect(preferOrder(completed, pending).order_status).toBe("COMPLETED");
  });
});

describe("dedupeOrdersByIdentity", () => {
  it("collapses LOCAL + server pending twins into one row", () => {
    const rows = [
      order({
        id: "client-1",
        client_order_id: "client-1",
        order_number: "LOCAL-AAAA",
        order_status: "PENDING",
        sync_status: "pending_sync",
      }),
      order({
        id: "server-1",
        client_order_id: "client-1",
        order_number: "A-1001",
        order_status: "PENDING",
        sync_status: "synced",
      }),
    ];
    const deduped = dedupeOrdersByIdentity(rows);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].id).toBe("server-1");
  });
});

describe("reconcilePendingOrders", () => {
  it("does not show two pending rows for one saved order", () => {
    const local = [
      order({
        id: "client-1",
        client_order_id: "client-1",
        order_number: "LOCAL-AAAA",
        order_status: "PENDING",
        sync_status: "pending_sync",
      }),
    ];
    const server = [
      order({
        id: "server-1",
        client_order_id: "client-1",
        order_number: "A-1001",
        order_status: "PENDING",
      }),
    ];
    const result = reconcilePendingOrders(server, local, {
      "client-1": "server-1",
    });
    expect(result.pending).toHaveLength(1);
    expect(result.pending[0].id).toBe("server-1");
    expect(result.deleteIds).toContain("client-1");
  });

  it("does not resurrect a completed order as pending from server", () => {
    const local = [
      order({
        id: "client-1",
        client_order_id: "client-1",
        order_number: "LOCAL-AAAA",
        order_status: "COMPLETED",
        sync_status: "pending_sync",
        updated_at: "2026-08-06T10:05:00.000Z",
      }),
    ];
    const server = [
      order({
        id: "server-1",
        client_order_id: "client-1",
        order_number: "A-1001",
        order_status: "PENDING",
      }),
    ];
    const result = reconcilePendingOrders(server, local, {
      "client-1": "server-1",
    });
    expect(result.pending).toHaveLength(0);
    expect(result.deleteIds).toContain("client-1");
    // Must persist COMPLETED under server id so next poll still knows.
    expect(result.localUpdates.some((u) => u.id === "server-1")).toBe(true);
    expect(
      result.localUpdates.find((u) => u.id === "server-1")?.order_status,
    ).toBe("COMPLETED");
  });

  it("second poll after LOCAL delete still keeps completed out of pending", () => {
    // Simulates: first reconcile deleted LOCAL-*, wrote server-id COMPLETED.
    // Second poll: local only has server-id COMPLETED; server still PENDING.
    const local = [
      order({
        id: "server-1",
        client_order_id: "client-1",
        order_number: "A-1001",
        order_status: "COMPLETED",
        sync_status: "pending_sync",
        updated_at: "2026-08-06T10:06:00.000Z",
      }),
    ];
    const server = [
      order({
        id: "server-1",
        client_order_id: "client-1",
        order_number: "A-1001",
        order_status: "PENDING",
      }),
    ];
    const result = reconcilePendingOrders(server, local, {
      "client-1": "server-1",
    });
    expect(result.pending).toHaveLength(0);
    expect(
      result.localUpdates.find((u) => u.id === "server-1")?.order_status,
    ).toBe("COMPLETED");
  });

  it("matches completed local via reverse idMap when server omits client_order_id", () => {
    const local = [
      order({
        id: "client-9",
        client_order_id: "client-9",
        order_number: "LOCAL-CCCC",
        order_status: "COMPLETED",
        sync_status: "pending_sync",
      }),
    ];
    const server = [
      order({
        id: "server-9",
        order_number: "A-1009",
        order_status: "PENDING",
      }),
    ];
    const result = reconcilePendingOrders(server, local, {
      "client-9": "server-9",
    });
    expect(result.pending).toHaveLength(0);
    expect(
      result.localUpdates.find((u) => u.id === "server-9")?.order_status,
    ).toBe("COMPLETED");
  });

  it("does not invent COMPLETED when synced pending disappears from server", () => {
    const local = [
      order({
        id: "server-gone",
        client_order_id: "client-gone",
        order_number: "A-7777",
        order_status: "PENDING",
        sync_status: "synced",
      }),
    ];
    const result = reconcilePendingOrders([], local, {});
    expect(result.pending).toHaveLength(0);
    expect(result.localUpdates).toHaveLength(0);
  });

  it("keeps unsynced local pending when server has not received it yet", () => {
    const local = [
      order({
        id: "client-2",
        client_order_id: "client-2",
        order_number: "LOCAL-BBBB",
        order_status: "PENDING",
        sync_status: "pending_sync",
      }),
    ];
    const result = reconcilePendingOrders([], local, {});
    expect(result.pending).toHaveLength(1);
    expect(result.pending[0].id).toBe("client-2");
  });

  it("stress: 100 creates then completes never leave duplicates or ghosts", () => {
    const local: Order[] = [];
    const serverPending: Order[] = [];
    const idMap: Record<string, string> = {};

    for (let i = 0; i < 100; i++) {
      const clientId = `client-${i}`;
      const serverId = `server-${i}`;
      const mode = i % 4;

      if (mode === 0) {
        // Saved pending, both local + server twins present (race window).
        local.push(
          order({
            id: clientId,
            client_order_id: clientId,
            order_number: `LOCAL-${i}`,
            order_status: "PENDING",
            sync_status: "pending_sync",
            customer_name: `Walkin ${i}`,
            created_at: `2026-08-06T10:${String(i).padStart(2, "0")}:00.000Z`,
          }),
        );
        serverPending.push(
          order({
            id: serverId,
            client_order_id: clientId,
            order_number: `A-${1000 + i}`,
            order_status: "PENDING",
            customer_name: `Walkin ${i}`,
            created_at: `2026-08-06T10:${String(i).padStart(2, "0")}:00.000Z`,
          }),
        );
        idMap[clientId] = serverId;
      } else if (mode === 1) {
        // Completed locally while server still pending.
        local.push(
          order({
            id: clientId,
            client_order_id: clientId,
            order_number: `LOCAL-${i}`,
            order_status: "COMPLETED",
            sync_status: "pending_sync",
            customer_name: `Done ${i}`,
          }),
        );
        serverPending.push(
          order({
            id: serverId,
            client_order_id: clientId,
            order_number: `A-${1000 + i}`,
            order_status: "PENDING",
            customer_name: `Done ${i}`,
          }),
        );
        idMap[clientId] = serverId;
      } else if (mode === 2) {
        // Local-only pending (not synced yet).
        local.push(
          order({
            id: clientId,
            client_order_id: clientId,
            order_number: `LOCAL-${i}`,
            order_status: "PENDING",
            sync_status: "pending_sync",
            order_type: i % 2 === 0 ? "phone" : "walkin",
            customer_name: `Local ${i}`,
          }),
        );
      } else {
        // Already mapped to server id only.
        serverPending.push(
          order({
            id: serverId,
            client_order_id: clientId,
            order_number: `A-${1000 + i}`,
            order_status: "PENDING",
            order_type: "website",
            customer_name: `Web ${i}`,
          }),
        );
        local.push(
          order({
            id: serverId,
            client_order_id: clientId,
            order_number: `A-${1000 + i}`,
            order_status: "PENDING",
            sync_status: "synced",
            order_type: "website",
            customer_name: `Web ${i}`,
          }),
        );
      }
    }

    const result = reconcilePendingOrders(serverPending, local, idMap);
    const ids = result.pending.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);

    const clientKeys = result.pending.map(
      (o) => o.client_order_id || o.id,
    );
    expect(new Set(clientKeys).size).toBe(clientKeys.length);

    // mode 1 tickets must never appear as pending.
    for (let i = 1; i < 100; i += 4) {
      expect(
        result.pending.some(
          (o) => o.client_order_id === `client-${i}` || o.id === `server-${i}`,
        ),
      ).toBe(false);
    }

    // mode 0 / 2 / 3 should appear exactly once each.
    for (let i = 0; i < 100; i++) {
      if (i % 4 === 1) continue;
      const matches = result.pending.filter(
        (o) => o.client_order_id === `client-${i}` || o.id === `server-${i}`,
      );
      expect(matches).toHaveLength(1);
    }

    expect(result.pending.length).toBe(75);
  });

  it("stress: rapid complete-after-save across 100 tickets stays clean", () => {
    const local: Order[] = [];
    const serverPending: Order[] = [];
    const idMap: Record<string, string> = {};

    for (let i = 0; i < 100; i++) {
      const clientId = `c-${i}`;
      const serverId = `s-${i}`;
      idMap[clientId] = serverId;
      // Cashier completed immediately; CREATE synced so server row exists pending
      // until COMPLETE patch lands.
      local.push(
        order({
          id: i % 2 === 0 ? clientId : serverId,
          client_order_id: clientId,
          order_number: i % 2 === 0 ? `LOCAL-${i}` : `B-${i}`,
          order_status: "COMPLETED",
          sync_status: "pending_sync",
          payment_method: i % 3 === 0 ? "card" : "cash",
          order_type: i % 2 === 0 ? "walkin" : "phone",
        }),
      );
      serverPending.push(
        order({
          id: serverId,
          client_order_id: clientId,
          order_number: `B-${i}`,
          order_status: "PENDING",
        }),
      );
    }

    const result = reconcilePendingOrders(serverPending, local, idMap);
    expect(result.pending).toHaveLength(0);
    expect(result.deleteIds.length).toBeGreaterThan(0);
  });
});
