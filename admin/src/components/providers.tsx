"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AuthProvider } from "@/context/auth-context";
import { ThemeProvider, useAdminTheme } from "@/context/theme-context";
import { Toaster } from "sonner";

function ThemedToaster() {
  const { theme } = useAdminTheme();
  const light = theme === "light";
  return (
    <Toaster
      theme={light ? "light" : "dark"}
      position="top-right"
      richColors
    />
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <AuthProvider>
          {children}
          <ThemedToaster />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
