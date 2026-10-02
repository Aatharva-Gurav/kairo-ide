"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "cn";
import { useAuth } from "@/features/auth/store";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  const router = useRouter();
  const { login, enterOfflineMode, resetPassword } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setResetMessage(null);

    if (!email || !password) {
      setFormError("Please enter both email and password.");
      return;
    }

    setIsSubmitting(true);
    try {
      await login({ email, password });
      router.push("/");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to sign in. Please try again.";
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    setFormError(null);
    setResetMessage(null);

    if (!email) {
      setFormError("Please enter your email address in the field above to reset your password.");
      return;
    }

    try {
      await resetPassword(email);
      setResetMessage("Password reset email sent. Please check your inbox.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not send reset email.";
      setFormError(msg);
    }
  };

  const handleOfflineMode = () => {
    enterOfflineMode();
    router.push("/");
  };

  return (
    <form className={cn("flex flex-col gap-6", className)} onSubmit={handleSubmit} {...props}>
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Login to your account</h1>
          <p className="text-sm text-balance text-muted-foreground">
            Enter your email below to login to your account
          </p>
        </div>

        {formError && (
          <div className="p-3 text-xs rounded-lg bg-destructive/15 text-destructive border border-destructive/20 text-center animate-in fade-in-50 duration-150">
            {formError}
          </div>
        )}

        {resetMessage && (
          <div className="p-3 text-xs rounded-lg bg-primary/10 text-primary border border-primary/20 text-center animate-in fade-in-50 duration-150">
            {resetMessage}
          </div>
        )}

        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            type="email"
            placeholder="m@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isSubmitting}
            required
            autoComplete="email"
          />
        </Field>

        <Field>
          <div className="flex items-center">
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <button
              type="button"
              onClick={handleForgotPassword}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline cursor-pointer"
            >
              Forgot your password?
            </button>
          </div>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isSubmitting}
            required
            autoComplete="current-password"
          />
        </Field>

        <Field>
          <Button type="submit" disabled={isSubmitting} className="w-full cursor-pointer font-medium">
            {isSubmitting ? (
              <div className="flex items-center gap-2">
                <div className="size-3.5 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                <span>Signing in...</span>
              </div>
            ) : (
              "Login"
            )}
          </Button>
        </Field>

        <FieldSeparator>Or continue with</FieldSeparator>

        <div className="flex flex-col gap-2">
          {/* Offline / Local Mode Button */}
          <Button
            variant="outline"
            type="button"
            onClick={handleOfflineMode}
            className="w-full cursor-pointer text-xs font-medium"
          >
            Continue in Offline Mode
          </Button>

          <FieldDescription className="text-center pt-2">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="underline underline-offset-4 font-medium hover:text-foreground">
              Sign up
            </Link>
          </FieldDescription>
        </div>
      </FieldGroup>
    </form>
  );
}
