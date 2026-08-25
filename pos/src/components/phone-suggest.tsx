"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { customersRepo } from "@/services/api";
import { POS_CACHE_UPDATED_EVENT } from "@/lib/offline-events";
import { cn, formatPkPhone, normalizePkPhone } from "@/lib/utils";
import type { Customer } from "@/types";

type PhoneSuggestProps = {
  value: string;
  onChange: (formatted: string) => void;
  onSelectCustomer: (customer: Customer) => void;
  className?: string;
  disabled?: boolean;
};

export function PhoneSuggest({
  value,
  onChange,
  onSelectCustomer,
  className,
  disabled,
}: PhoneSuggestProps) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Customer[]>([]);
  const [active, setActive] = useState(0);
  const reqSeq = useRef(0);

  useEffect(() => {
    const digits = normalizePkPhone(value);
    if (digits.length < 4) {
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return;
    }

    const seq = ++reqSeq.current;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const rows = await customersRepo.search(digits);
          if (seq !== reqSeq.current) return;
          setSuggestions(rows);
          setActive(0);
          setOpen(rows.length > 0);
        } catch {
          if (seq !== reqSeq.current) return;
          setSuggestions([]);
          setOpen(false);
        } finally {
          if (seq === reqSeq.current) setLoading(false);
        }
      })();
    }, 180);

    return () => window.clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Cloud customer lookup finishes in the background — refresh suggestions
  // without making the initial keystroke wait on the network.
  useEffect(() => {
    const onCacheUpdated = (e: Event) => {
      const keys =
        (e as CustomEvent<{ keys?: string[] }>).detail?.keys || [];
      if (!keys.includes("customers")) return;
      const digits = normalizePkPhone(value);
      if (digits.length < 4) return;
      const seq = ++reqSeq.current;
      void customersRepo.search(digits).then((rows) => {
        if (seq !== reqSeq.current) return;
        setSuggestions(rows);
        setActive(0);
        setOpen(rows.length > 0);
        setLoading(false);
      });
    };
    window.addEventListener(POS_CACHE_UPDATED_EVENT, onCacheUpdated);
    return () =>
      window.removeEventListener(POS_CACHE_UPDATED_EVENT, onCacheUpdated);
  }, [value]);

  const pick = (customer: Customer) => {
    onSelectCustomer(customer);
    setOpen(false);
    setSuggestions([]);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = suggestions[active];
      if (row) pick(row);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <Input
        inputMode="numeric"
        placeholder="0300-1234567"
        maxLength={12}
        autoComplete="off"
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open}
        disabled={disabled}
        className={className}
        value={value}
        onChange={(e) => {
          onChange(formatPkPhone(e.target.value));
        }}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      {loading && normalizePkPhone(value).length >= 4 ? (
        <p className="mt-1 text-[11px] text-zinc-500">Looking up…</p>
      ) : null}
      {open && suggestions.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="phone-suggest-panel absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border py-1 shadow-lg"
        >
          {suggestions.map((c, idx) => {
            const phone = formatPkPhone(c.phone);
            return (
              <li key={c.id || c.phone}>
                <button
                  type="button"
                  role="option"
                  aria-selected={idx === active}
                  className={cn(
                    "flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm",
                    idx === active ? "row-active" : "row-idle",
                  )}
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => pick(c)}
                >
                  <span className="phone-line font-semibold tabular-nums">
                    {phone}
                  </span>
                  <span className="meta-line truncate text-xs">
                    {c.name || "Customer"}
                    {c.address ? ` · ${c.address}` : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
