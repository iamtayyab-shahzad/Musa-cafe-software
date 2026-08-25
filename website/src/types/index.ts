export interface ProductSize {
  id: string;
  product_id: string;
  size: string;
  price: number;
  was_price?: number;
}

export interface Category {
  id: string;
  name: string;
  image: string;
  display_order: number;
  visible: boolean;
}

export interface Product {
  id: string;
  category_id: string;
  category?: Category;
  name: string;
  description: string;
  image: string;
  featured: boolean;
  available: boolean;
  display_order: number;
  sizes: ProductSize[];
  popular?: boolean;
}

export interface Offer {
  id: string;
  title: string;
  description: string;
  image: string;
  active: boolean;
  start_date?: string;
  end_date?: string;
}

export interface Location {
  id: string;
  name: string;
  delivery_charge: number;
}

export interface Settings {
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
  address: string;
  email: string;
  /** JSON string array of soft-drink flavors available in shop. */
  drink_flavors?: string;
  /** First-visit website appearance: dark | dim | light | warm */
  default_site_theme?: string;
}

export type PaymentMethod = "easypaisa" | "jazzcash" | "bank" | "cod";

export interface CartItem {
  id: string;
  product_id: string;
  product_name: string;
  product_image: string;
  size_id: string;
  size: string;
  price: number;
  quantity: number;
  special_instructions?: string;
  /** Flyer/combo deal — excluded from Fri & Sun 10% promo. */
  is_deal?: boolean;
  was_price?: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  default_address?: string;
  default_location_id?: string | null;
}

export interface OrderItemPayload {
  product_id: string;
  product_size_id: string;
  quantity: number;
  special_instructions?: string;
}

export interface CreateOrderPayload {
  customer_name: string;
  phone: string;
  address: string;
  location_id: string;
  payment_method: PaymentMethod;
  order_notes?: string;
  items: OrderItemPayload[];
  is_guest: boolean;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_size_id: string;
  quantity: number;
  price: number;
  special_instructions?: string;
  product?: Product;
  product_size?: ProductSize;
}

export interface Order {
  id: string;
  order_number: string;
  customer_id?: string;
  customer_name: string;
  phone: string;
  address: string;
  location_id: string;
  delivery_charge: number;
  cash_on_delivery_fee: number;
  payment_method: PaymentMethod;
  order_status: string;
  order_type: string;
  order_notes?: string;
  subtotal: number;
  discount?: number;
  grand_total: number;
  items: OrderItem[];
  created_at: string;
  updated_at: string;
}

export interface Review {
  id: string;
  name: string;
  rating: number;
  comment: string;
  avatar?: string;
}

export interface LoginPayload {
  phone: string;
  password: string;
}

export interface RegisterPayload {
  name: string;
  phone: string;
  password: string;
}
