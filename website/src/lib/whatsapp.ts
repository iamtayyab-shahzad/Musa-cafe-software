import { PASSWORD_RESET_WHATSAPP } from "@/lib/constants";

/** Strip non-digits and ensure country code for wa.me links. */
export function whatsAppDigits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 11) {
    return `92${digits.slice(1)}`;
  }
  return digits;
}

export function whatsAppResetHref(phone: string = PASSWORD_RESET_WHATSAPP): string {
  const to = whatsAppDigits(phone);
  return `https://wa.me/${to}?text=${encodeURIComponent("RESET")}`;
}
