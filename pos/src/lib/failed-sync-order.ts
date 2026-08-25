import type { OfflineAction, Order } from "@/types";
import { orderIdsFromSyncAction } from "@/lib/storage-health";

export type FailedSyncOrderSummary = {
  customer_name: string;
  items_label: string;
  grand_total: number;
  created_at: string | null;
  order_number: string | null;
  source: "local_order" | "create_payload";
};

function itemLabel(items: Order["items"] | undefined): string {
  if (!items?.length) return "No items on record";
  return items
    .map((i) => {
      const name =
        i.product?.name ||
        (i as { product_name?: string }).product_name ||
        "Item";
      const size =
        i.product_size?.size || (i as { size?: string }).size || "";
      const qty = i.quantity || 1;
      return size ? `${qty}× ${name} (${size})` : `${qty}× ${name}`;
    })
    .join(", ");
}

function summaryFromOrder(
  order: Order,
  source: FailedSyncOrderSummary["source"],
): FailedSyncOrderSummary {
  return {
    customer_name: (order.customer_name || "").trim() || "—",
    items_label: itemLabel(order.items),
    grand_total: Number(order.grand_total) || 0,
    created_at: order.created_at || null,
    order_number: order.order_number || null,
    source,
  };
}

function summaryFromCreatePayload(
  payload: Record<string, unknown>,
): FailedSyncOrderSummary | null {
  const input = payload.input;
  if (!input || typeof input !== "object") return null;
  const p = input as Record<string, unknown>;
  const items = Array.isArray(p.items)
    ? (p.items as Order["items"])
    : undefined;
  const subtotal = Number(p.subtotal) || 0;
  const discount = Number(p.discount) || 0;
  const delivery = Number(p.delivery_charge) || 0;
  const cod = Number(p.cash_on_delivery_fee) || 0;
  const grand =
    Number(p.grand_total) ||
    Math.max(0, subtotal - discount + delivery + cod);
  return summaryFromOrder(
    {
      id: String(payload.localId || p.client_order_id || ""),
      created_at: typeof p.created_at === "string" ? p.created_at : "",
      updated_at: "",
      order_number: typeof p.order_number === "string" ? p.order_number : "",
      customer_name: String(p.customer_name || ""),
      phone: String(p.phone || ""),
      address: String(p.address || ""),
      location_id: String(p.location_id || ""),
      delivery_charge: delivery,
      cash_on_delivery_fee: cod,
      payment_method: String(p.payment_method || ""),
      order_status: "PENDING",
      order_type: String(payload.orderType || ""),
      order_notes: String(p.order_notes || ""),
      subtotal,
      discount,
      grand_total: grand,
      items,
    },
    "create_payload",
  );
}

/**
 * Resolve display details for a dead-letter sync action by matching its
 * payload to a local order (or falling back to CREATE_ORDER input).
 */
export function resolveFailedSyncOrder(
  action: Pick<OfflineAction, "type" | "payload">,
  localOrders: Order[],
): FailedSyncOrderSummary | null {
  const ids = new Set(orderIdsFromSyncAction(action));
  if (ids.size) {
    const match = localOrders.find(
      (o) =>
        ids.has(o.id) ||
        (o.client_order_id != null && ids.has(o.client_order_id)),
    );
    if (match) return summaryFromOrder(match, "local_order");
  }

  if (action.type === "CREATE_ORDER" && action.payload && typeof action.payload === "object") {
    return summaryFromCreatePayload(action.payload as Record<string, unknown>);
  }

  // UPDATE payloads sometimes carry customer/items in `updates`.
  if (
    action.type === "UPDATE_ORDER" &&
    action.payload &&
    typeof action.payload === "object"
  ) {
    const updates = (action.payload as { updates?: Record<string, unknown> })
      .updates;
    if (updates && typeof updates === "object") {
      const items = Array.isArray(updates.items)
        ? (updates.items as Order["items"])
        : undefined;
      if (
        updates.customer_name ||
        updates.grand_total != null ||
        items?.length
      ) {
        return summaryFromOrder(
          {
            id: String((action.payload as { id?: string }).id || ""),
            created_at: "",
            updated_at: "",
            order_number: "",
            customer_name: String(updates.customer_name || ""),
            phone: String(updates.phone || ""),
            address: "",
            location_id: "",
            delivery_charge: Number(updates.delivery_charge) || 0,
            cash_on_delivery_fee: Number(updates.cash_on_delivery_fee) || 0,
            payment_method: String(updates.payment_method || ""),
            order_status: "PENDING",
            order_type: "",
            order_notes: "",
            subtotal: Number(updates.subtotal) || 0,
            discount: Number(updates.discount) || 0,
            grand_total: Number(updates.grand_total) || 0,
            items,
          },
          "create_payload",
        );
      }
    }
  }

  return null;
}
