"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sidebar, MobileSidebar, TopBar } from "@/components/layout/shell";
import { useMenuSearch } from "@/context/menu-search-context";
import { TOKEN_KEY, isTokenExpired, isOfflineSessionValid } from "@/lib/utils";
import { shop } from "@/lib/shop";
import { isOnline } from "@/lib/network";
import {
  sessionRepo,
  settingsApi,
  warmOfflineCache,
  productsApi,
  categoriesApi,
  locationsApi,
  ordersApi,
} from "@/services/api";

let offlineCacheWarmed = false;

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { search, setSearch } = useMenuSearch();
  const [navOpen, setNavOpen] = useState(false);
  const isNewOrder = pathname.startsWith("/orders/new");

  useEffect(() => {
    if (!isNewOrder) setSearch("");
  }, [isNewOrder, setSearch]);

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: settingsApi.get,
    retry: false,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let token = localStorage.getItem(TOKEN_KEY);
      const session = await sessionRepo.get();

      // Restore session from IndexedDB when localStorage is empty / JWT expired.
      // Offline: allow grace period so cashiers keep selling without re-login.
      if (!token || isTokenExpired(token)) {
        if (isOfflineSessionValid(session) && session?.token) {
          if (!isOnline() || !token) {
            localStorage.setItem(TOKEN_KEY, session.token);
            token = session.token;
          }
        }
      }

      const allowOffline =
        !isOnline() && isOfflineSessionValid(session) && Boolean(token);

      if (!token || (isTokenExpired(token) && !allowOffline)) {
        localStorage.removeItem(TOKEN_KEY);
        if (isOnline()) await sessionRepo.clear();
        if (!cancelled) router.replace("/login");
        return;
      }

      // Warm catalog once per session; prefetch into React Query for New Order.
      if (isOnline() && !offlineCacheWarmed) {
        offlineCacheWarmed = true;
        void warmOfflineCache().then(() => {
          if (cancelled) return;
          void queryClient.prefetchQuery({
            queryKey: ["products"],
            queryFn: productsApi.list,
            staleTime: 5 * 60_000,
          });
          void queryClient.prefetchQuery({
            queryKey: ["categories"],
            queryFn: categoriesApi.list,
            staleTime: 5 * 60_000,
          });
          void queryClient.prefetchQuery({
            queryKey: ["locations"],
            queryFn: locationsApi.list,
            staleTime: 5 * 60_000,
          });
          void queryClient.prefetchQuery({
            queryKey: ["settings"],
            queryFn: settingsApi.get,
            staleTime: 5 * 60_000,
          });
          void queryClient.prefetchQuery({
            queryKey: ["orders", "pending"],
            queryFn: ordersApi.pending,
            staleTime: 2_000,
          });
        });
      } else if (!isOnline()) {
        void queryClient.prefetchQuery({
          queryKey: ["orders", "pending"],
          queryFn: ordersApi.pending,
          staleTime: 2_000,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, queryClient]);

  return (
    <div className="flex h-screen overflow-hidden bg-black text-white">
      <Sidebar />
      <MobileSidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          restaurantName={settings?.restaurant_name || shop.name}
          search={isNewOrder ? search : undefined}
          onSearch={isNewOrder ? setSearch : undefined}
          onMenuOpen={() => setNavOpen(true)}
        />
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
