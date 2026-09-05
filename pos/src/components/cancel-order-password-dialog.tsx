"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

/** Shop rule: cancel-order requires this password so a cashier cannot void a paid ticket. */
export const CANCEL_ORDER_PASSWORD = "cancel";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function CancelOrderPasswordDialog({
  open,
  onOpenChange,
  onConfirm,
}: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setPassword("");
      setError("");
    }
  }, [open]);

  const submit = () => {
    if (password.trim() !== CANCEL_ORDER_PASSWORD) {
      setError("Wrong password");
      return;
    }
    onOpenChange(false);
    onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Enter password to cancel</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-zinc-400">
          Cancel is locked so a paid order cannot be voided by mistake.
        </p>
        <div className="space-y-2">
          <Label htmlFor="cancel-order-password">Password</Label>
          {/*
            Chrome/Edge treat a lone password field as a login form and dump the
            saved POS username ("staff") into the nearest page text input (Order
            History search). Absorb that autofill here instead.
          */}
          <input
            type="text"
            name="username"
            autoComplete="username"
            defaultValue=""
            tabIndex={-1}
            aria-hidden="true"
            className="pointer-events-none absolute h-0 w-0 opacity-0"
          />
          <PasswordInput
            key={open ? "open" : "closed"}
            id="cancel-order-password"
            name="cancel-order-pin"
            autoComplete="new-password"
            autoFocus
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Back
          </Button>
          <Button variant="danger" onClick={submit}>
            Cancel order
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
