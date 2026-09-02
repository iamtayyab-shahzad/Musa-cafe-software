export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface BaseEntity {
  id: string;
  created_at: string;
  updated_at: string;
}

export interface Category extends BaseEntity {
  name: string;
  image: string;
  display_order: number;
  visible: boolean;
}

export interface ProductSize extends BaseEntity {
  product_id: string;
  size: string;
  price: number;
  was_price?: number;
}

export interface Product extends BaseEntity {
  category_id: string;
  category?: Category;
  name: string;
  description: string;
  image: string;
  featured: boolean;
  available: boolean;
  allow_manual_price?: boolean;
  display_order: number;
  sizes?: ProductSize[];
}

export interface Location extends BaseEntity {
  name: string;
  delivery_charge: number;
}

export interface Offer extends BaseEntity {
  title: string;
  description: string;
  image: string;
  active: boolean;
  start_date?: string | null;
  end_date?: string | null;
  discount_label?: string;
}

export interface InventoryItem extends BaseEntity {
  name: string;
  category?: string;
  unit: string;
  unit_kind?: string;
  purchase_unit?: string;
  units_per_purchase?: number;
  stock: number;
  purchase_price: number;
  avg_cost_micros?: number;
  minimum_stock: number;
  supplier?: string;
  supplier_id?: string;
  is_active?: boolean;
  inventory_transactions?: InventoryTransaction[];
}

export interface InventoryTransaction extends BaseEntity {
  inventory_id: string;
  quantity: number;
  transaction_type: string;
  reason: string;
  total_cost?: number;
  balance_after?: number;
}

export interface Recipe extends BaseEntity {
  product_id: string;
  product_size_id?: string | null;
  inventory_id: string;
  quantity_required: number;
  product?: Product;
  inventory?: InventoryItem;
}

export interface OrderItem extends BaseEntity {
  order_id: string;
  product_id: string;
  product_size_id: string;
  quantity: number;
  price: number;
  special_instructions?: string;
  product?: Product;
  product_size?: ProductSize;
  /** Flat name kept for IndexedDB / print when nested `product` is dropped. */
  product_name?: string;
  /** Flat size label kept for IndexedDB / print when nested size is dropped. */
  size?: string;
  /** Deal description kept for kitchen "included items" when nested product is dropped. */
  product_description?: string;
}

export interface Order extends BaseEntity {
  order_number: string;
  /** Asia/Karachi YYYY-MM-DD for daily tokens. */
  business_date?: string;
  /** Shop-facing 1,2,3… reset each business day. */
  daily_number?: number;
  client_order_id?: string | null;
  customer_id?: string;
  customer_name: string;
  phone: string;
  address: string;
  location_id: string;
  location?: Location;
  delivery_charge: number;
  cash_on_delivery_fee: number;
  payment_method: string;
  order_status: string;
  order_type: string;
  order_notes: string;
  subtotal: number;
  discount?: number;
  grand_total: number;
  items?: OrderItem[];
  /** sync_failed = cloud push permanently died; ticket still shows locally. */
  sync_status?: "local" | "pending_sync" | "synced" | "sync_failed";
}

export interface Settings extends BaseEntity {
  restaurant_name: string;
  phone: string;
  whatsapp: string;
  logo: string;
  opening_time: string;
  closing_time: string;
  cash_on_delivery_fee: number;
  currency: string;
  google_maps: string;
  facebook: string;
  instagram: string;
  /** JSON string array of soft-drink flavors available in shop. */
  drink_flavors?: string;
  /**
   * When true, POS Save Pending / Enter finalize completes the order and
   * prints kitchen + customer receipts. Default false = classic flow.
   */
  pos_one_click_complete?: boolean;
  /**
   * When true, Order History shows Edit. Default false locks past tickets.
   */
  pos_allow_history_edit?: boolean;
}

export type PaymentMethod =
  | "cash"
  | "easypaisa"
  | "jazzcash"
  | "card"
  | "cod";

export type OrderType = "walkin" | "phone" | "website";

export type OrderStatus = "PENDING" | "COMPLETED" | "CANCELLED";

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  last_order_at: string;
  order_count: number;
  /** Last delivery location used for this phone (for autofill). */
  last_location_id?: string;
}

export interface CreateOrderItemInput {
  product_id: string;
  product_size_id: string;
  quantity: number;
  price?: number;
  special_instructions?: string;
}

export interface CreateOrderInput {
  customer_name: string;
  phone: string;
  address?: string;
  location_id: string;
  payment_method: string;
  order_notes?: string;
  client_order_id?: string;
  /** Original till timestamp (ISO). Backend must persist this, not sync time. */
  created_at?: string;
  daily_number?: number;
  business_date?: string;
  items: CreateOrderItemInput[];
}

export interface BillLine {
  key: string;
  product_id: string;
  product_name: string;
  product_image: string;
  size_id: string;
  size: string;
  price: number;
  quantity: number;
  special_instructions?: string;
  crust?: string;
  toppings?: string;
  extras?: string;
  /** Flyer/combo deal — excluded from Fri & Sun 10% promo. */
  is_deal?: boolean;
  /** Cashier-entered price for sweets / weight items. */
  allow_manual_price?: boolean;
  was_price?: number;
}

export interface ProductSizeInput {
  id?: string;
  label: string;
  price: number;
}

export interface PendingDraft {
  id: string;
  created_at: string;
  updated_at: string;
  order_type: OrderType;
  customer_name: string;
  phone: string;
  address: string;
  location_id: string;
  delivery_charge: number;
  payment_method: PaymentMethod;
  order_notes: string;
  items: BillLine[];
}

export interface OfflineAction {
  id: string;
  created_at: string;
  type:
    | "CREATE_ORDER"
    | "COMPLETE_ORDER"
    | "CANCEL_ORDER"
    | "UPDATE_ORDER"
    | "UPDATE_PRODUCT"
    | "CREATE_PRODUCT"
    | "CREATE_PRODUCT_SIZE"
    | "UPDATE_PRODUCT_SIZE"
    | "DELETE_PRODUCT_SIZE"
    | "UPDATE_CATEGORY"
    | "CREATE_CATEGORY"
    | "UPDATE_INVENTORY"
    | "CREATE_INVENTORY"
    | "UPDATE_SETTINGS"
    | "CREATE_OFFER"
    | "UPDATE_OFFER";
  payload: unknown;
  synced: boolean;
  /** Permanently failed — excluded from active sync until discarded/retried. */
  dead?: boolean;
  error?: string;
  attempts?: number;
  next_retry_at?: string;
}

export interface SyncConflict {
  id: string;
  created_at: string;
  entity: string;
  entity_id: string;
  message: string;
  local?: unknown;
  server?: unknown;
}

export interface SyncStatus {
  syncing: boolean;
  pending_count: number;
  completed: number;
  total: number;
  current_action: string | null;
}

export interface StaffLoginInput {
  username: string;
  password: string;
}
