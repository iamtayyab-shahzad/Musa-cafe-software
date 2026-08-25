"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/auth-context";
import { PASSWORD_RESET_WHATSAPP } from "@/lib/constants";
import { whatsAppResetHref } from "@/lib/whatsapp";

const phoneSchema = z
  .string()
  .min(11, "Enter an 11-digit mobile number")
  .max(11, "Enter an 11-digit mobile number")
  .regex(/^03\d{9}$/, "Use format 03XXXXXXXXX (11 digits)");

const schema = z.object({
  phone: phoneSchema,
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/";
  const resetHref = whatsAppResetHref(PASSWORD_RESET_WHATSAPP);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (values: FormValues) => {
    try {
      await login(values);
      toast.success("Welcome back!");
      router.push(redirect);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Login failed");
    }
  };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-16">
      <h1 className="font-display text-5xl text-white">Login</h1>
      <p className="mt-2 text-zinc-400">
        Sign in to track orders and checkout faster.
      </p>
      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            inputMode="numeric"
            autoComplete="tel"
            placeholder="03XXXXXXXXX"
            {...register("phone")}
          />
          <p className="text-xs text-zinc-500">
            Same number you used when registering
          </p>
          {errors.phone && (
            <p className="text-xs text-red-400">{errors.phone.message}</p>
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
            <p className="text-xs text-red-400">{errors.password.message}</p>
          )}
        </div>
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Signing in..." : "Sign In"}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-zinc-400">
        Forgot password?{" "}
        <a
          href={resetHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-orange-400 hover:underline"
        >
          Reset via WhatsApp
        </a>
      </p>
      <p className="mt-1 text-center text-xs text-zinc-500">
        Opens WhatsApp with RESET — send it from your registered number to get a
        reset link.
      </p>
      <p className="mt-6 text-center text-sm text-zinc-400">
        New here?{" "}
        <Link href="/register" className="text-orange-400 hover:underline">
          Create an account
        </Link>
      </p>
      <p className="mt-2 text-center text-sm text-zinc-500">
        Or{" "}
        <Link href="/checkout/guest" className="text-orange-400 hover:underline">
          continue as guest
        </Link>
      </p>
    </div>
  );
}
