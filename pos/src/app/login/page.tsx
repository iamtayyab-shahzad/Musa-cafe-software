"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { setToken } from "@/lib/api-client";
import { TOKEN_KEY, isTokenExpired, isOfflineSessionValid } from "@/lib/utils";
import {
  clearForcedOffline,
  isBrowserOnline,
  isOnline,
} from "@/lib/network";
import { authApi, sessionRepo, syncKrunchiesMenu } from "@/services/api";
import { shop } from "@/lib/shop";
import { useEffect, useState, type FormEvent } from "react";

const schema = z.object({
  username: z.string().min(1, "Username required"),
  password: z.string().min(1, "Password required"),
});

type FormValues = z.infer<typeof schema>;

/** Chrome autofill often fills the DOM without notifying react-hook-form. */
function readLoginFields(
  form: HTMLFormElement | null,
  values: FormValues,
): FormValues {
  const fd = form ? new FormData(form) : null;
  const username = String(
    fd?.get("username") ?? values.username ?? "",
  ).trim();
  const password = String(fd?.get("password") ?? values.password ?? "");
  return { username, password };
}

export default function LoginPage() {
  const router = useRouter();
  const [offline, setOffline] = useState(false);
  const [canContinueOffline, setCanContinueOffline] = useState(false);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: "", password: "" },
  });

  useEffect(() => {
    // Landing on login must not inherit a stale "API dead" cooldown from logout.
    clearForcedOffline();
    setOffline(!isBrowserOnline());
    const sync = () => setOffline(!navigator.onLine);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);

    const syncAutofill = () => {
      const userEl = document.getElementById(
        "username",
      ) as HTMLInputElement | null;
      const passEl = document.getElementById(
        "password",
      ) as HTMLInputElement | null;
      if (userEl?.value) {
        setValue("username", userEl.value, { shouldValidate: true });
      }
      if (passEl?.value) {
        setValue("password", passEl.value, { shouldValidate: true });
      }
    };
    // Autofill often lands after first paint.
    const t1 = window.setTimeout(syncAutofill, 50);
    const t2 = window.setTimeout(syncAutofill, 400);
    const t3 = window.setTimeout(syncAutofill, 1000);
    window.addEventListener("focusin", syncAutofill);

    (async () => {
      const token = localStorage.getItem(TOKEN_KEY);
      const session = await sessionRepo.get();
      if (token && !isTokenExpired(token)) {
        router.replace("/orders/new");
        return;
      }
      if (token && isTokenExpired(token) && navigator.onLine) {
        localStorage.removeItem(TOKEN_KEY);
      }

      if (isOfflineSessionValid(session)) {
        setCanContinueOffline(true);
        if (!navigator.onLine && session?.token) {
          localStorage.setItem(TOKEN_KEY, session.token);
          router.replace("/orders/new");
        }
      }
    })();

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      window.removeEventListener("focusin", syncAutofill);
    };
  }, [router, setValue]);

  const continueOffline = async () => {
    const session = await sessionRepo.get();
    if (!isOfflineSessionValid(session) || !session?.token) {
      toast.error("No saved session found — connect once to log in");
      setCanContinueOffline(false);
      return;
    }
    setToken(session.token);
    toast.message("Continuing with offline session");
    router.replace("/orders/new");
  };

  const onSubmit = async (values: FormValues, event?: FormEvent) => {
    clearForcedOffline();
    const form =
      event?.currentTarget instanceof HTMLFormElement
        ? event.currentTarget
        : null;
    const creds = readLoginFields(form, values);
    if (!creds.username || !creds.password) {
      toast.error("Username and password required");
      return;
    }

    // Always attempt login — do not trust navigator.onLine / circuit breaker.
    // Shop Wi‑Fi often says offline while the API is reachable.
    try {
      const data = await authApi.login(creds);
      setToken(data.token);
      toast.success("Logged in");
      router.replace("/orders/new");

      // Heavy work after navigation — never block the cashier on menu sync.
      void (async () => {
        try {
          await syncKrunchiesMenu();
        } catch {
          /* sync engine / next login will retry */
        }
        try {
          const { hydrateDailyNumberFromServer } = await import(
            "@/lib/daily-order-number"
          );
          const { karachiYmd } = await import("@/lib/local-sales");
          await hydrateDailyNumberFromServer(karachiYmd(), { force: true });
        } catch {
          /* ignore */
        }
      })();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Login failed";
      if (
        canContinueOffline &&
        (/timed out|unavailable|network/i.test(msg) || !isOnline())
      ) {
        toast.message("Server unreachable — continuing offline");
        await continueOffline();
        return;
      }
      if (/timed out/i.test(msg)) {
        toast.error(
          "Login timed out — check Wi‑Fi / API, then tap Sign In again",
        );
        return;
      }
      if (/unavailable|network/i.test(msg) && !isBrowserOnline()) {
        toast.error("Login requires internet.");
        return;
      }
      toast.error(msg);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4">
      <form
        onSubmit={handleSubmit((values, e) =>
          onSubmit(values, e as FormEvent | undefined),
        )}
        className="w-full max-w-md space-y-5 rounded-2xl border border-zinc-800 bg-zinc-950 p-8"
        autoComplete="on"
      >
        <div>
          <h1 className="text-3xl font-black text-white">
            <span className="text-orange-500">{shop.shortName}</span> POS
          </h1>
          <p className="mt-2 text-zinc-400">Staff login</p>
          {offline ? (
            <p className="mt-2 rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-sm text-orange-200">
              Offline — use a previous session to keep selling, or reconnect to
              sign in.
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            autoComplete="username"
            autoFocus
            {...register("username")}
          />
          {errors.username && (
            <p className="text-sm text-red-400">{errors.username.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            {...register("password")}
          />
          {errors.password && (
            <p className="text-sm text-red-400">{errors.password.message}</p>
          )}
        </div>
        <Button type="submit" size="xl" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Signing in..." : "Sign In"}
        </Button>
        {canContinueOffline ? (
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() => void continueOffline()}
          >
            Continue offline with saved session
          </Button>
        ) : null}
      </form>
    </div>
  );
}
