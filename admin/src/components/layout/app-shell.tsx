"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Percent,
  Receipt,
  Settings,
  ShoppingBag,
  Store,
  Tags,
  Users,
  Globe,
  X,
  Sun,
  Moon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { shop } from "@/lib/shop";
import { useAdminTheme } from "@/context/theme-context";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/products", label: "Products", icon: Package },
  { href: "/categories", label: "Categories", icon: Tags },
  { href: "/deals", label: "Deals & Offers", icon: Percent },
  { href: "/orders", label: "Orders", icon: ShoppingBag },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/profit-loss", label: "Profit & Loss", icon: Receipt },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/website-settings", label: "Website Settings", icon: Globe },
  { href: "/restaurant-settings", label: "Restaurant Settings", icon: Settings },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active =
          pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-3 text-base font-bold transition-colors",
              active
                ? "bg-orange-500 text-black"
                : "text-zinc-300 hover:bg-zinc-900 hover:text-white",
            )}
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, ready, logout } = useAuth();
  const { theme, toggleTheme } = useAdminTheme();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!user || user.type !== "admin") router.replace("/login");
  }, [ready, user, router]);

  if (!ready || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-zinc-400">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-black text-white">
      <aside className="hidden w-72 shrink-0 flex-col border-r border-zinc-900 bg-zinc-950 lg:flex">
        <div className="border-b border-zinc-900 px-5 py-5">
          <div className="flex items-center gap-2">
            <Store className="h-6 w-6 text-orange-500" />
            <div>
              <p className="text-lg font-black leading-tight">
                <span className="text-orange-500">{shop.shortName}</span> Admin
              </p>
              <p className="text-xs text-zinc-500">{user.name}</p>
            </div>
          </div>
        </div>
        <NavLinks />
        <div className="border-t border-zinc-900 p-3">
          <Button
            variant="secondary"
            className="w-full justify-start"
            onClick={() => {
              logout();
              router.replace("/login");
            }}
          >
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </div>
      </aside>

      {open ? (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <button
            className="absolute inset-0 bg-black/70"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <aside className="relative z-10 flex h-full w-72 flex-col bg-zinc-950">
            <div className="flex items-center justify-between border-b border-zinc-900 px-4 py-4">
              <p className="font-black">
                <span className="text-orange-500">{shop.shortName}</span> Admin
              </p>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <NavLinks onNavigate={() => setOpen(false)} />
            <div className="border-t border-zinc-900 p-3">
              <Button
                variant="secondary"
                className="w-full justify-start"
                onClick={() => {
                  logout();
                  router.replace("/login");
                }}
              >
                <LogOut className="h-4 w-4" />
                Logout
              </Button>
            </div>
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center gap-3 border-b border-zinc-900 bg-zinc-950/80 px-4 backdrop-blur">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-zinc-400">
              Admin Dashboard
            </p>
            <p className="truncate text-base font-bold text-white">
              {shop.name}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            title={theme === "light" ? "Switch to dark" : "Light background"}
            aria-label="Toggle appearance"
          >
            {theme === "light" ? (
              <Moon className="h-5 w-5" />
            ) : (
              <Sun className="h-5 w-5" />
            )}
          </Button>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
