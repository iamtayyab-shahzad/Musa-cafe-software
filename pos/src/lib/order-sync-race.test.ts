import { describe, expect, it } from "vitest";
import {
  dedupeOrdersByIdentity,
  reconcilePendingOrders,
} from "@/lib/order-identity";
import type { Order, OrderType, PaymentMethod } from "@/types";

function makeOrder(opts: {
  id: string;
  client?: string;
  status: Order["order_status"];
  sync?: Order["sync_status"];
  type?: OrderType;
  pay?: PaymentMethod;
  local?: boolean;
  n?: number;
}): Order {
  const i = opts.n ?? 0;
  return {
    id: opts.id,
    client_order_id: opts.client || opts.id,
    created_at: `2026-08-06T11:${String(i % 60).padStart(2, "0")}:00.000Z`,
    updated_at: `2026-08-06T11:${String(i % 60).padStart(2, "0")}:30.000Z`,
    order_number: opts.local ? `LOCAL-${opts.id.slice(-4)}` : `T-${i}`,
    customer_name: `Cust ${i}`,
    phone: `0300${String(1000000 + i).slice(-7)}`,
    address: opts.type === "phone" ? "Street 1" : "",
    location_id: "loc",
    delivery_charge: opts.type === "phone" ? 100 : 0,
    cash_on_delivery_fee: opts.pay === "cod" ? 50 : 0,
    payment_method: opts.pay || "cash",
    order_status: opts.status,
    order_type: opts.type || "walkin",
    order_notes: "",
    subtotal: 500 + i,
    discount: 0,
    grand_total: 500 + i + (opts.type === "phone" ? 100 : 0),
    items: [],
    sync_status: opts.sync || "synced",
  };
}

describe("sync race simulations", () => {
  it("create then pending-poll before id remap leaves one pending", () => {
    // Timeline:
    // 1) local create client-uuid pending_sync
    // 2) server accepts create -> server-uuid PENDING
    // 3) poll runs BEFORE local delete
    const local = [
      makeOrder({
        id: "c1",
        client: "c1",
        status: "PENDING",
        sync: "pending_sync",
        local: true,
        n: 1,
      }),
    ];
    const server = [
      makeOrder({
        id: "s1",
        client: "c1",
        status: "PENDING",
        n: 1,
      }),
    ];
    const result = reconcilePendingOrders(server, local, {});
    expect(result.pending).toHaveLength(1);
    expect(dedupeOrdersByIdentity([...local, ...server])).toHaveLength(1);
  });

  it("complete then pending-poll before COMPLETE patch leaves zero pending", () => {
    const local = [
      makeOrder({
        id: "c2",
        client: "c2",
        status: "COMPLETED",
        sync: "pending_sync",
        local: true,
        type: "phone",
        pay: "cod",
        n: 2,
      }),
    ];
    const server = [
      makeOrder({
        id: "s2",
        client: "c2",
        status: "PENDING",
        type: "phone",
        pay: "cod",
        n: 2,
      }),
    ];
    const result = reconcilePendingOrders(server, local, { c2: "s2" });
    expect(result.pending).toHaveLength(0);
    expect(result.localUpdates.some((u) => u.id === "s2" && u.order_status === "COMPLETED")).toBe(
      true,
    );
    expect(result.deleteIds).toContain("c2");
  });

  it("100 mixed walkin/phone/website create+complete options stay unique", () => {
    const types: OrderType[] = ["walkin", "phone", "website"];
    const pays: PaymentMethod[] = ["cash", "card", "cod"];
    const local: Order[] = [];
    const server: Order[] = [];
    const idMap: Record<string, string> = {};

    for (let i = 0; i < 100; i++) {
      const client = `cid-${i}`;
      const serverId = `sid-${i}`;
      const type = types[i % 3];
      const pay = pays[i % 3];
      idMap[client] = serverId;

      const action = i % 5;
      if (action === 0 || action === 1) {
        // pending twin race
        local.push(
          makeOrder({
            id: client,
            client,
            status: "PENDING",
            sync: "pending_sync",
            local: true,
            type,
            pay,
            n: i,
          }),
        );
        server.push(
          makeOrder({
            id: serverId,
            client,
            status: "PENDING",
            type,
            pay,
            n: i,
          }),
        );
      } else if (action === 2) {
        // completed locally, server lagging
        local.push(
          makeOrder({
            id: i % 2 ? client : serverId,
            client,
            status: "COMPLETED",
            sync: "pending_sync",
            local: i % 2 === 0,
            type,
            pay,
            n: i,
          }),
        );
        server.push(
          makeOrder({
            id: serverId,
            client,
            status: "PENDING",
            type,
            pay,
            n: i,
          }),
        );
      } else if (action === 3) {
        // cancelled locally
        local.push(
          makeOrder({
            id: client,
            client,
            status: "CANCELLED",
            sync: "pending_sync",
            local: true,
            type,
            pay,
            n: i,
          }),
        );
        server.push(
          makeOrder({
            id: serverId,
            client,
            status: "PENDING",
            type,
            pay,
            n: i,
          }),
        );
      } else {
        // local only, not on server yet
        local.push(
          makeOrder({
            id: client,
            client,
            status: "PENDING",
            sync: "pending_sync",
            local: true,
            type,
            pay,
            n: i,
          }),
        );
      }
    }

    const result = reconcilePendingOrders(server, local, idMap);
    const keys = result.pending.map((o) => o.client_order_id || o.id);
    expect(new Set(keys).size).toBe(keys.length);

    for (const row of result.pending) {
      expect(row.order_status).toBe("PENDING");
    }

    // completed/cancelled cohorts must be absent
    for (let i = 0; i < 100; i++) {
      const action = i % 5;
      if (action === 2 || action === 3) {
        expect(
          result.pending.some((o) => o.client_order_id === `cid-${i}`),
        ).toBe(false);
      }
    }
  });
});
