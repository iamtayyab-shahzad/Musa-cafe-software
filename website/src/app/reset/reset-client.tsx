"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { resetCustomerPassword } from "@/services/api";

const schema = z
  .object({
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string().min(6, "Confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof schema>;

export default function ResetClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (values: FormValues) => {
    if (!token) {
      toast.error("Invalid reset link. Request a new one via WhatsApp.");
      return;
    }
    try {
      await resetCustomerPassword({ token, password: values.password });
      toast.success("Password updated. You can sign in now.");
      router.push("/login");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not reset password",
      );
    }
  };

  if (!token) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-16">
        <h1 className="font-display text-5xl text-white">Reset Password</h1>
        <p className="mt-4 text-zinc-400">
          This link is missing or invalid. On the{" "}
          <Link href="/login" className="text-orange-400 hover:underline">
            login page
          </Link>
          , tap &quot;Reset via WhatsApp&quot; and send{" "}
          <span className="font-mono text-zinc-300">RESET</span> from the phone
          number on your account.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-16">
      <h1 className="font-display text-5xl text-white">New Password</h1>
      <p className="mt-2 text-zinc-400">
        Choose a new password for your account. This link expires in 1 hour.
      </p>
      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <PasswordInput id="password" {...register("password")} />
          <p className="text-xs text-zinc-500">At least 6 characters</p>
          {errors.password && (
            <p className="text-xs text-red-400">{errors.password.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <PasswordInput
            id="confirmPassword"
            {...register("confirmPassword")}
          />
          {errors.confirmPassword && (
            <p className="text-xs text-red-400">
              {errors.confirmPassword.message}
            </p>
          )}
        </div>
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Update Password"}
        </Button>
      </form>
    </div>
  );
}
