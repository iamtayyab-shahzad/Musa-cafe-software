export type UserType = "admin" | "staff";

export type AuthUser = {
  id: string;
  name: string;
  username: string;
  type: UserType;
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  image: string;
  displayOrder: number;
  hidden: boolean;
};

export type PizzaSize = {
  id?: string;
  label: string;
  price: number;
};

export type Product = {
  id: string;
  name: string;
  categoryId: string;
  description: string;
  image: string;
  available: boolean;
  featured: boolean;
  allowManualPrice?: boolean;
  basePrice: number;
  pizzaSizes?: PizzaSize[];
};

export type Deal = {
  id: string;
  title: string;
  description: string;
  image: string;
  enabled: boolean;
  offerPopup: boolean;
  homepageDeal: boolean;
  discountLabel: string;
};

export type DeliveryLocation = {
  id: string;
  name: string;
  charge: number;
  active: boolean;
};

export type SiteThemeOption = "dark" | "dim" | "light" | "warm";

export type WebsiteSettings = {
  restaurantName: string;
  logo: string;
  phone: string;
  alternatePhone: string;
  whatsapp: string;
  address: string;
  openingTime: string;
  closingTime: string;
  homepageBanner: string;
  aboutSection: string;
  contactSection: string;
  footerInfo: string;
  /** First-visit theme on the customer website */
  defaultSiteTheme: SiteThemeOption;
};

export type RestaurantSettings = {
  restaurantName: string;
  logo: string;
  phone: string;
  whatsapp: string;
  openingHours: string;
  closingHours: string;
  currency: string;
  cashOnDeliveryFee: number;
  drinkFlavors: string[];
  /** POS: Save Pending also completes and prints both receipts */
  posOneClickComplete: boolean;
};

export type Customer = {
  id: string;
  name: string;
  phone: string;
  ordersCount: number;
  totalSpent: number;
  lastOrderAt: string;
};

export type InventoryItem = {
  id: string;
  name: string;
  category: string;
  currentStock: number;
  unit: string;
  unitKind: string;
  purchaseUnit: string;
  unitsPerPurchase: number;
  purchasePrice: number;
  avgCostMicros: number;
  supplier: string;
  supplierId?: string;
  minimumStock: number;
  isActive: boolean;
  /** Stock value in whole Rupees (derived). */
  stockValue: number;
};

export type Supplier = {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  contactName: string;
  notes: string;
  isActive: boolean;
};

export type PurchaseLine = {
  id?: string;
  inventoryId: string;
  inventoryName?: string;
  purchaseUnit: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  quantityBase?: number;
};

export type Purchase = {
  id: string;
  invoiceNumber: string;
  supplierId?: string;
  supplierName: string;
  purchaseDate: string;
  subtotal: number;
  discount: number;
  otherCost: number;
  grandTotal: number;
  paymentMethod: string;
  amountPaid: number;
  status: string;
  notes: string;
  items: PurchaseLine[];
};

export type Expense = {
  id: string;
  category: string;
  title: string;
  amount: number;
  expenseDate: string;
  paymentMethod: string;
  notes: string;
  receiptImage: string;
  recurrence: string;
};

export type Recipe = {
  id: string;
  productName: string;
  ingredients: { itemName: string; quantity: number; unit: string }[];
};

export type StockHistory = {
  id: string;
  itemName: string;
  change: number;
  reason: string;
  createdAt: string;
};

export function emptyWebsiteSettings(): WebsiteSettings {
  return {
    restaurantName: "",
    logo: "",
    phone: "",
    alternatePhone: "",
    whatsapp: "",
    address: "",
    openingTime: "",
    closingTime: "",
    homepageBanner: "",
    aboutSection: "",
    contactSection: "",
    footerInfo: "",
    defaultSiteTheme: "dark",
  };
}

export function emptyRestaurantSettings(): RestaurantSettings {
  return {
    restaurantName: "",
    logo: "",
    phone: "",
    whatsapp: "",
    openingHours: "",
    closingHours: "",
    currency: "Rs",
    cashOnDeliveryFee: 0,
    drinkFlavors: [],
    posOneClickComplete: false,
  };
}
