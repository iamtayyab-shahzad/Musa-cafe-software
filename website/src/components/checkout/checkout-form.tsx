"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { PaymentQrPanel } from "@/components/checkout/payment-qr-panel";
import { useAuth } from "@/context/auth-context";
import { useCart } from "@/context/cart-context";
import { LAST_ORDER_KEY, PAYMENT_METHODS } from "@/lib/constants";
import { formatPrice } from "@/lib/utils";
import { weekendPromoLabel } from "@/lib/discount-rules";
import { createOrder, getLocations, getSettings } from "@/services/api";
import type { Location, PaymentMethod, Settings } from "@/types";
import { AfterHoursNotice } from "@/components/checkout/after-hours-notice";
import {
  DEFAULT_SHOP_CLOSE,
  DEFAULT_SHOP_OPEN,
  afterHoursOrderNote,
  getShopHoursStatus,
} from "@/lib/shop-hours";

const checkoutSchema = z.object({
  customer_name: z.string().trim().min(2, "Name is required"),
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => /^03\d{9}$/.test(v), {
      message: "Enter 11-digit mobile number (03XXXXXXXXX)",
    }),
  address: z.string().trim().min(5, "Address is required"),
  location_id: z.string().min(1, "Select a delivery location"),
  payment_method: z.enum(["easypaisa", "jazzcash", "bank", "cod"]),
  order_notes: z.string().optional(),
});

type CheckoutFormValues = z.infer<typeof checkoutSchema>;

interface CheckoutFormProps {
  guestMode?: boolean;
}

export function CheckoutForm({ guestMode = false }: CheckoutFormProps) {
  const router = useRouter();
  const { items, subtotal, discount, payable, clearCart } = useCart();
  const { customer, isAuthenticated, saveCheckoutDefaults } = useAuth();
  const [locations, setLocations] = useState<Location[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      customer_name: "",
      phone: "",
      address: "",
      location_id: "",
      payment_method: "cod",
      order_notes: "",
    },
  });

  const locationId = watch("location_id");
  const paymentMethod = watch("payment_method");

  useEffect(() => {
    Promise.all([getLocations(), getSettings()])
      .then(([locationRows, restaurantSettings]) => {
        setLocations(locationRows);
        setSettings(restaurantSettings);
      })
      .catch((error) =>
        toast.error(
          error instanceof Error
            ? error.message
            : "Unable to load checkout settings",
        ),
      );
  }, []);

  useEffect(() => {
    if (!guestMode && customer) {
      setValue("customer_name", customer.name);
      setValue("phone", customer.phone);
      if (customer.default_address) {
        setValue("address", customer.default_address);
      }
      if (customer.default_location_id) {
        setValue("location_id", customer.default_location_id, {
          shouldValidate: true,
        });
      }
    }
  }, [customer, guestMode, setValue]);

  const deliveryCharge = useMemo(() => {
    return locations.find((l) => l.id === locationId)?.delivery_charge ?? 0;
  }, [locations, locationId]);

  const codFee =
    paymentMethod === "cod" ? (settings?.cash_on_delivery_fee ?? 0) : 0;
  const grandTotal = payable + deliveryCharge + codFee;
  const currency = settings?.currency ?? "Rs";

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="font-display text-5xl text-white">Checkout</h1>
        <p className="mt-4 text-zinc-400">Your cart is empty.</p>
        <Button asChild className="mt-8">
          <Link href="/menu">Browse Menu</Link>
        </Button>
      </div>
    );
  }

  const onSubmit = async (values: CheckoutFormValues) => {
    if (
      items.length === 0 ||
      items.some(
        (item) =>
          !item.product_id ||
          !item.size_id ||
          !Number.isInteger(item.quantity) ||
          item.quantity < 1,
      )
    ) {
      toast.error("Your cart contains invalid items. Please review it.");
      return;
    }

    setSubmitting(true);
    try {
      const hours = getShopHoursStatus(DEFAULT_SHOP_OPEN, DEFAULT_SHOP_CLOSE);
      const afterNote = afterHoursOrderNote(hours);
      const notes = [afterNote, values.order_notes?.trim()]
        .filter(Boolean)
        .join("\n");

      const payload = {
        ...values,
        order_notes: notes || undefined,
        is_guest: guestMode || !isAuthenticated,
        items: items.map((item) => ({
          product_id: item.product_id,
          product_size_id: item.size_id,
          quantity: item.quantity,
          special_instructions: item.special_instructions,
        })),
      };
      const order = await createOrder(payload);
      localStorage.setItem(LAST_ORDER_KEY, JSON.stringify(order));
      if (isAuthenticated && !guestMode) {
        void saveCheckoutDefaults({
          name: values.customer_name,
          address: values.address,
          location_id: values.location_id,
        });
      }
      clearCart();
      toast.success(
        hours.isOpen
          ? "Order placed successfully!"
          : hours.serveWhen === "today"
            ? `Order placed! We'll prepare it when we open today at ${hours.openLabel}.`
            : `Order placed! We'll prepare it tomorrow when we open at ${hours.openLabel}.`,
      );
      router.push(`/order-success?order=${order.order_number}`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to place order. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="font-display text-4xl text-white sm:text-5xl">
          {guestMode ? "Guest Checkout" : "Checkout"}
        </h1>
        <p className="mt-2 text-sm text-zinc-400 sm:text-base">
          {guestMode
            ? "Order without creating an account."
            : isAuthenticated
              ? "Review your details and place your order."
              : "Login for a faster checkout, or continue as guest."}
        </p>
        {!guestMode && !isAuthenticated && (
          <div className="mt-4 flex flex-wrap gap-3">
            <Button asChild variant="outline" className="min-h-11">
              <Link href="/login?redirect=/checkout">Customer Login</Link>
            </Button>
            <Button asChild variant="secondary" className="min-h-11">
              <Link href="/checkout/guest">Continue as Guest</Link>
            </Button>
          </div>
        )}
        <AfterHoursNotice className="mt-4" />
      </div>

      <form
        id="checkout-form"
        onSubmit={handleSubmit(onSubmit)}
        className="grid gap-8 pb-28 lg:grid-cols-[1fr_360px] lg:gap-10 lg:pb-0"
      >
        <div className="space-y-6 sm:space-y-8">
          <section className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-white">
              Customer Information
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="customer_name">Full Name</Label>
                <Input
                  id="customer_name"
                  className="min-h-11"
                  {...register("customer_name")}
                />
                {errors.customer_name && (
                  <p className="text-xs text-red-400">
                    {errors.customer_name.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  className="min-h-11"
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="03XXXXXXXXX"
                  maxLength={11}
                  {...register("phone", {
                    onChange: (e) => {
                      const digits = String(e.target.value || "")
                        .replace(/\D/g, "")
                        .slice(0, 11);
                      e.target.value = digits;
                    },
                  })}
                />
                {errors.phone && (
                  <p className="text-xs text-red-400">{errors.phone.message}</p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Delivery Address</Label>
              <Textarea id="address" {...register("address")} />
              {errors.address && (
                <p className="text-xs text-red-400">{errors.address.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Location</Label>
              <Select
                value={locationId}
                onValueChange={(value) =>
                  setValue("location_id", value, { shouldValidate: true })
                }
              >
                <SelectTrigger className="min-h-11">
                  <SelectValue placeholder="Select delivery area" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name} — {formatPrice(loc.delivery_charge, currency)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.location_id && (
                <p className="text-xs text-red-400">
                  {errors.location_id.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="order_notes">Order Notes (optional)</Label>
              <Textarea id="order_notes" {...register("order_notes")} />
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-white">Payment Method</h2>
            <RadioGroup
              value={paymentMethod}
              onValueChange={(value) =>
                setValue("payment_method", value as PaymentMethod, {
                  shouldValidate: true,
                })
              }
            >
              {PAYMENT_METHODS.map((method) => (
                <label
                  key={method.id}
                  className="flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border border-zinc-800 p-4 transition-colors hover:border-zinc-600 has-[[data-state=checked]]:border-orange-500"
                >
                  <RadioGroupItem value={method.id} className="mt-1" />
                  <div>
                    <p className="font-medium text-white">{method.label}</p>
                    <p className="text-sm text-zinc-400">{method.description}</p>
                    {method.id === "cod" && (
                      <p className="mt-1 text-xs text-orange-400">
                        +{formatPrice(settings?.cash_on_delivery_fee ?? 0, currency)}{" "}
                        fee
                      </p>
                    )}
                  </div>
                </label>
              ))}
            </RadioGroup>

            {(paymentMethod === "easypaisa" ||
              paymentMethod === "jazzcash" ||
              paymentMethod === "bank") && (
              <PaymentQrPanel method={paymentMethod} />
            )}
          </section>
        </div>

        <aside className="h-fit rounded-xl border border-zinc-800 bg-zinc-950 p-6 lg:sticky lg:top-24">
          <h2 className="text-lg font-semibold text-white">Order Summary</h2>
          <ul className="mt-4 space-y-3">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex justify-between gap-3 text-sm text-zinc-400"
              >
                <span>
                  {item.quantity}× {item.product_name} ({item.size})
                </span>
                <span className="shrink-0 text-white">
                  {formatPrice(item.price * item.quantity, currency)}
                </span>
              </li>
            ))}
          </ul>
          <Separator className="my-4" />
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-zinc-400">
              <span>Subtotal</span>
              <span>{formatPrice(subtotal, currency)}</span>
            </div>
            {discount > 0 ? (
              <div className="flex justify-between text-emerald-400">
                <span>{weekendPromoLabel(items) || "Promo discount"}</span>
                <span>-{formatPrice(discount, currency)}</span>
              </div>
            ) : null}
            <div className="flex justify-between text-zinc-400">
              <span>Delivery</span>
              <span>
                {locationId
                  ? formatPrice(deliveryCharge, currency)
                  : "Select location"}
              </span>
            </div>
            {codFee > 0 && (
              <div className="flex justify-between text-zinc-400">
                <span>COD Fee</span>
                <span>{formatPrice(codFee, currency)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 text-base font-semibold text-white">
              <span>Grand Total</span>
              <span className="text-orange-400">
                {formatPrice(grandTotal, currency)}
              </span>
            </div>
          </div>
          <Button
            type="submit"
            className="mt-6 hidden min-h-12 w-full lg:flex"
            size="lg"
            disabled={submitting}
          >
            {submitting ? "Placing Order..." : "Place Order"}
          </Button>
        </aside>

        {/* Mobile sticky place-order — desktop uses sidebar button */}
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-800 bg-black/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-sm lg:hidden">
          <div className="mb-2 flex items-center justify-between text-sm text-zinc-300">
            <span>Total</span>
            <span className="font-semibold text-orange-400">
              {formatPrice(grandTotal, currency)}
            </span>
          </div>
          <Button
            type="submit"
            className="min-h-12 w-full"
            size="lg"
            disabled={submitting}
          >
            {submitting ? "Placing Order..." : "Place Order"}
          </Button>
        </div>
      </form>
    </div>
  );
}
