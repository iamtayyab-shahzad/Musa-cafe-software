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
import { isOnline } from "@/lib/network";
import { authApi, sessionRepo, syncKrunchiesMenu } from "@/services/api";
import { shop } from "@/lib/shop";
import { useEffect, useState } from "react";

const schema = z.object({
  username: z.string().min(1, "Username required"),
  password: z.string().min(1, "Password required"),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const [offline, setOffline] = useState(false);
  const [canContinueOffline, setCanContinueOffline] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: "", password: "" },
  });

  useEffect(() => {
    setOffline(!isOnline());
    const sync = () => setOffline(!navigator.onLine);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);

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
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, [router]);

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

  const onSubmit = async (values: FormValues) => {
    if (!isOnline()) {
      if (canContinueOffline) {
        await continueOffline();
        return;
      }
      toast.error("Login requires internet.");
      return;
    }
    try {
      const data = await authApi.login(values);
      setToken(data.token);
      try {
        await syncKrunchiesMenu();
      } catch {
        toast.warning("Logged in, but menu sync will retry on the next login.");
      }
      toast.success("Logged in");
      router.replace("/orders/new");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full max-w-md space-y-5 rounded-2xl border border-zinc-800 bg-zinc-950 p-8"
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
          <Input id="username" autoFocus {...register("username")} />
          {errors.username && (
            <p className="text-sm text-red-400">{errors.username.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <PasswordInput id="password" {...register("password")} />
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
