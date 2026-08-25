"use client";

import Image from "next/image";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { PAYMENT_DETAILS, PAYMENT_QR_SRC } from "@/lib/constants";
import type { PaymentMethod } from "@/types";

function CopyRow({ label, value }: { label: string; value: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Could not copy — please copy manually");
    }
  };

  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-zinc-800 bg-black/40 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-xs text-zinc-500">{label}</p>
        <p className="break-all font-mono text-sm font-medium text-white">{value}</p>
      </div>
      <button
        type="button"
        onClick={copy}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-900 hover:text-orange-400"
        aria-label={`Copy ${label}`}
      >
        <Copy className="h-4 w-4" />
      </button>
    </div>
  );
}

export function PaymentQrPanel({ method }: { method: PaymentMethod }) {
  if (method === "cod") return null;

  const appLabel =
    method === "jazzcash"
      ? "JazzCash"
      : method === "easypaisa"
        ? "EasyPaisa"
        : "bank";

  return (
    <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-4">
      <p className="text-sm font-semibold text-orange-300">How to pay</p>
      <p className="mt-1 text-sm text-zinc-400">
        On another device, scan the QR with your {appLabel} / bank app. On this
        phone, use the details below (tap copy). Pay the order total, then place
        your order.
      </p>

      {PAYMENT_QR_SRC ? (
        <div className="relative mx-auto mt-4 aspect-[3/4] w-full max-w-[260px] overflow-hidden rounded-lg bg-yellow-400">
          <Image
            src={PAYMENT_QR_SRC}
            alt="Payment QR code"
            fill
            className="object-contain"
            sizes="260px"
            priority
          />
        </div>
      ) : (
        <p className="mt-4 text-sm text-zinc-400">
          Payment QR and account numbers will appear here once the shop adds
          them in settings.
        </p>
      )}

      <div className="mt-4 space-y-2">
        {PAYMENT_DETAILS.tillId ? (
          <CopyRow label="Till ID" value={PAYMENT_DETAILS.tillId} />
        ) : null}
        {PAYMENT_DETAILS.raastId ? (
          <CopyRow label="Raast ID" value={PAYMENT_DETAILS.raastId} />
        ) : null}
        {PAYMENT_DETAILS.iban ? (
          <CopyRow label="IBAN" value={PAYMENT_DETAILS.iban} />
        ) : null}
        {PAYMENT_DETAILS.jazzcashNumber ? (
          <CopyRow label="JazzCash number" value={PAYMENT_DETAILS.jazzcashNumber} />
        ) : null}
        {PAYMENT_DETAILS.accountName ? (
          <CopyRow label="Account name" value={PAYMENT_DETAILS.accountName} />
        ) : null}
      </div>

      {PAYMENT_DETAILS.jazzcashUssd && PAYMENT_DETAILS.tillId ? (
        <p className="mt-3 text-xs leading-relaxed text-zinc-500">
          JazzCash USSD: dial{" "}
          <span className="font-mono text-zinc-300">{PAYMENT_DETAILS.jazzcashUssd}</span>{" "}
          and enter Till ID{" "}
          <span className="font-mono text-zinc-300">{PAYMENT_DETAILS.tillId}</span> to
          pay.
        </p>
      ) : null}
    </div>
  );
}
