"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { POS_URL, useAuth } from "@/context/auth-context";
import { shop } from "@/lib/shop";

export default function LoginPage() {
  const router = useRouter();
  const { user, ready, login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ username?: string; password?: string }>(
    {},
  );

  useEffect(() => {
    if (ready && user?.type === "admin") router.replace("/dashboard");
  }, [ready, user, router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: { username?: string; password?: string } = {};
    if (!username.trim()) nextErrors.username = "Username required";
    if (!password) nextErrors.password = "Password required";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSubmitting(true);
    try {
      const type = await login(username, password);
      if (type === "staff") {
        toast.success("Staff login — opening POS");
        window.location.href = POS_URL;
        return;
      }
      toast.success("Welcome back, Admin");
      router.replace("/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md space-y-5 rounded-2xl border border-zinc-800 bg-zinc-950 p-8"
      >
        <div>
          <h1 className="text-3xl font-black text-white">
            <span className="text-orange-500">{shop.shortName}</span> Admin
          </h1>
          <p className="mt-2 text-zinc-400">
            Admin opens the dashboard. Staff are sent to POS.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          {errors.username ? (
            <p className="text-sm text-red-400">{errors.username}</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <PasswordInput
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {errors.password ? (
            <p className="text-sm text-red-400">{errors.password}</p>
          ) : null}
        </div>
        <Button type="submit" size="xl" className="w-full" disabled={submitting}>
          {submitting ? "Signing in..." : "Sign In"}
        </Button>
      </form>
    </div>
  );
}
