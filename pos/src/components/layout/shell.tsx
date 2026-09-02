"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  ClipboardList,
  History,
  LayoutDashboard,
  Menu,
  Moon,
  RefreshCw,
  Settings,
  ShoppingCart,
  Sun,
  Warehouse,
  Wallet,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { useEffect, useState, type KeyboardEvent, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { ordersApi, sessionRepo } from "@/services/api";
import { isBrowserOnline, POS_CONNECTIVITY_EVENT } from "@/lib/network";
import {
  getSyncState,
  runSync,
  subscribeSync,
  type SyncEngineState,
} from "@/lib/sync-engine";
import { setToken } from "@/lib/api-client";
import { usePosTheme } from "@/context/theme-context";
import { shop } from "@/lib/shop";
import { mediaUrl } from "@/lib/media";

const LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/orders/new", label: "New Order", icon: ShoppingCart },
  { href: "/orders/pending", label: "Pending Orders", icon: ClipboardList },
  { href: "/orders/history", label: "Order History", icon: History },
  { href: "/inventory", label: "Inventory", icon: Warehouse },
  { href: "/expenses", label: "Expenses", icon: Wallet },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

function formatLastSync(iso: string | null) {
  if (!iso) return "Never";
  try {
    return new Date(iso).toLocaleTimeString("en-PK", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function SidebarPanel({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const [sync, setSync] = useState<SyncEngineState>(getSyncState());

  useEffect(() => subscribeSync(setSync), []);

  const { data: pendingOrders = [] } = useQuery({
    queryKey: ["orders", "pending"],
    queryFn: ordersApi.pending,
    refetchInterval: () => {
      if (typeof document !== "undefined" && document.hidden) return false;
      if (!isBrowserOnline()) return false;
      if (getSyncState().syncing) return false;
      return 45_000;
    },
    refetchOnWindowFocus: true,
    staleTime: 2_000,
  });
  const pendingCount = pendingOrders.length;

  return (
    <>
      <div className="border-b border-zinc-800 px-4 py-5">
        <p className="flex items-center gap-2 text-lg font-black text-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mediaUrl(shop.logo || "/logo.svg", { width: 80 })}
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 rounded-full object-cover"
          />
          <span>
            <span className="text-orange-500">{shop.shortName}</span> POS
          </span>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {sync.online ? (
            <span className="flex items-center gap-1 text-emerald-400">
              <Wifi className="h-3.5 w-3.5" /> Online
            </span>
          ) : (
            <span className="flex items-center gap-1 text-red-400">
              <WifiOff className="h-3.5 w-3.5" /> Offline
            </span>
          )}
          {sync.pending_count > 0 && (
            <span className="rounded bg-orange-500/20 px-1.5 py-0.5 text-orange-300">
              {sync.pending_count} to sync
            </span>
          )}
        </div>
        <div className="mt-2 space-y-1 text-[11px] text-zinc-500">
          <p>Last sync: {formatLastSync(sync.last_sync_at)}</p>
          {sync.syncing ? (
            <p className="flex items-center gap-1 text-orange-300">
              <RefreshCw className="h-3 w-3 animate-spin" />
              Syncing {sync.completed}/{sync.total || "…"}
              {sync.current_action ? ` · ${sync.current_action}` : ""}
            </p>
          ) : null}
          {sync.conflicts.length > 0 || sync.dead_count > 0 ? (
            <p className="text-amber-400">
              {sync.dead_count > 0
                ? `${sync.dead_count} failed sync item${sync.dead_count === 1 ? "" : "s"} — open Settings to retry`
                : `${sync.conflicts.length} conflict${sync.conflicts.length === 1 ? "" : "s"}`}
            </p>
          ) : null}
        </div>
        {sync.pending_count > 0 && sync.online ? (
          <button
            type="button"
            onClick={() => void runSync("manual")}
            disabled={sync.syncing}
            className="mt-2 w-full rounded-md border border-zinc-700 px-2 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-900 disabled:opacity-50"
          >
            Sync now
          </button>
        ) : null}
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {LINKS.map((link) => {
          const active =
            pathname === link.href || pathname.startsWith(link.href + "/");
          const Icon = link.icon;
          const showPendingBadge =
            link.href === "/orders/pending" && pendingCount > 0;
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-3 text-base font-semibold transition-colors",
                active
                  ? "bg-orange-500 text-black"
                  : "text-zinc-300 hover:bg-zinc-900 hover:text-white",
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="flex-1">{link.label}</span>
              {showPendingBadge ? (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-black",
                    active
                      ? "bg-black text-orange-400"
                      : "bg-orange-500 text-black",
                  )}
                >
                  {pendingCount}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950 lg:flex">
      <SidebarPanel />
    </aside>
  );
}

export function MobileSidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex lg:hidden">
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        aria-label="Close menu"
        onClick={onClose}
      />
      <aside className="relative z-10 flex h-full w-72 max-w-[85vw] flex-col bg-zinc-950 shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-4">
          <p className="font-black text-white">
            <span className="text-orange-500">{shop.shortName}</span> POS
          </p>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-300 hover:bg-zinc-900"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <SidebarPanel onNavigate={onClose} />
      </aside>
    </div>
  );
}

export function TopBar({
  restaurantName,
  search,
  onSearch,
  onMenuOpen,
  searchInputRef,
  onSearchKeyDown,
}: {
  restaurantName: string;
  search?: string;
  onSearch?: (v: string) => void;
  onMenuOpen?: () => void;
  searchInputRef?: RefObject<HTMLInputElement | null>;
  onSearchKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const router = useRouter();
  const { theme, toggleTheme } = usePosTheme();
  const [now, setNow] = useState<Date | null>(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const sync = () => setOnline(isBrowserOnline());
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    window.addEventListener(POS_CONNECTIVITY_EVENT, sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      window.removeEventListener(POS_CONNECTIVITY_EVENT, sync);
    };
  }, []);

  const clockLabel = now
    ? `${now.toLocaleDateString("en-PK", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      })} · ${now.toLocaleTimeString("en-PK")}`
    : "\u00a0";

  return (
    <header className="shrink-0 border-b border-zinc-800 bg-black px-3 py-3 lg:h-16 lg:px-4 lg:py-0">
      <div className="flex flex-col gap-3 lg:h-16 lg:flex-row lg:items-center lg:gap-4">
        <div className="flex min-w-0 items-center gap-2">
          {onMenuOpen ? (
            <button
              type="button"
              onClick={onMenuOpen}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-900 lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-black text-white lg:text-lg">
              {restaurantName}
            </p>
            <p
              className="truncate text-xs text-zinc-400"
              suppressHydrationWarning
            >
              {clockLabel}
              {!online ? (
                <span className="ml-2 text-orange-400">· Working offline</span>
              ) : null}
            </p>
          </div>
        </div>

        {onSearch ? (
          <input
            ref={searchInputRef}
            data-pos-product-search="true"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="Search products…  ↓ products · Enter add"
            className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 text-base text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 lg:max-w-md"
            autoComplete="off"
          />
        ) : null}

        <div
          className={cn(
            "flex flex-wrap items-center gap-2",
            !onSearch && "lg:ml-auto",
            onSearch && "lg:ml-auto",
          )}
        >
          <button
            type="button"
            title={
              theme === "light"
                ? "Switch to dark"
                : "Switch to light background"
            }
            onClick={toggleTheme}
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-900"
          >
            {theme === "light" ? (
              <Moon className="h-5 w-5" />
            ) : (
              <Sun className="h-5 w-5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => router.push("/orders/new")}
            className="h-11 flex-1 rounded-lg bg-orange-500 px-4 text-sm font-bold text-black hover:bg-orange-400 sm:flex-none"
          >
            New Order
          </button>
          <button
            type="button"
            onClick={() => {
              setToken(null);
              void sessionRepo.clear();
              router.push("/login");
            }}
            className="h-11 flex-1 rounded-lg border border-zinc-700 px-4 text-sm font-bold text-zinc-300 hover:bg-zinc-900 sm:flex-none"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
