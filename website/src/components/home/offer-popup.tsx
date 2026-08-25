"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getOffers } from "@/services/api";
import { storageKey } from "@/lib/shop";
import { mediaUrl } from "@/lib/media";
import type { Offer } from "@/types";

export function OfferPopup() {
  const [offer, setOffer] = useState<Offer | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const dismissed = sessionStorage.getItem(storageKey("offer_dismissed"));
    if (dismissed) return;

    getOffers().then((data) => {
      if (data[0]) {
        setOffer(data[0]);
        setTimeout(() => setOpen(true), 1200);
      }
    });
  }, []);

  const handleClose = (value: boolean) => {
    setOpen(value);
    if (!value) sessionStorage.setItem(storageKey("offer_dismissed"), "1");
  };

  if (!offer) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="inset-x-4 bottom-auto top-[50%] max-h-[85dvh] w-auto max-w-md translate-y-[-50%] overflow-hidden rounded-xl p-0">
        <div className="relative aspect-[16/10]">
          <Image
            src={mediaUrl(offer.image, { width: 800 })}
            alt={offer.title}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 90vw, 448px"
          />
        </div>
        <div className="space-y-4 p-5 pt-2 sm:p-6">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl text-orange-400">
              {offer.title}
            </DialogTitle>
            <DialogDescription>{offer.description}</DialogDescription>
          </DialogHeader>
          <Button
            asChild
            className="min-h-12 w-full"
            onClick={() => handleClose(false)}
          >
            <Link href="/menu">Claim Offer</Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
