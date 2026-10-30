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

export function SignupForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  const router = useRouter();
  const { signup, enterOfflineMode } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [verificationRequired, setVerificationRequired] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!fullName.trim()) {
      setFormError("Please enter your full name.");
      return;
    }

    if (!email.trim()) {
      setFormError("Please enter a valid email address.");
      return;
    }

    if (password.length < 8) {
      setFormError("Password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setFormError("Passwords do not match. Please re-enter.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { requiresVerification } = await signup({
        fullName: fullName.trim(),
        email: email.trim(),
        password,
      });

      if (requiresVerification) {
        setVerificationRequired(true);
      } else {
        router.push("/onboarding");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create account. Please try again.";
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOfflineMode = () => {
    enterOfflineMode();
    router.push("/");
  };

  if (verificationRequired) {
    return (
      <div className={cn("flex flex-col gap-6 text-center", className)}>
        <div className="flex flex-col items-center gap-2">
          <div className="size-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-1">
            <svg
              className="size-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-bold tracking-tight">Check your email</h2>
          <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
            We sent a verification link to <strong className="text-foreground">{email}</strong>.
            Please verify your email address to complete registration.
          </p>
        </div>

        <Button
          variant="outline"
          type="button"
          onClick={() => router.push("/login")}
          className="w-full cursor-pointer"
        >
          Return to Login
        </Button>
      </div>
    );
  }

  return (
    <form className={cn("flex flex-col gap-6", className)} onSubmit={handleSubmit} {...props}>
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
          <p className="text-sm text-balance text-muted-foreground">
            Fill in the form below to create your account
          </p>
        </div>

        {formError && (
          <div className="p-3 text-xs rounded-lg bg-destructive/15 text-destructive border border-destructive/20 text-center animate-in fade-in-50 duration-150">
            {formError}
          </div>
        )}

        <Field>
          <FieldLabel htmlFor="name">Full Name</FieldLabel>
          <Input
            id="name"
            type="text"
            placeholder="John Doe"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={isSubmitting}
            required
            className="bg-background"
            autoComplete="name"
          />
        </Field>

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
            className="bg-background"
            autoComplete="email"
          />
          <FieldDescription>
            We&apos;ll use this to contact you. We will not share your email with anyone else.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isSubmitting}
            required
            className="bg-background"
            autoComplete="new-password"
          />
          <FieldDescription>
            Must be at least 8 characters long.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="confirm-password">Confirm Password</FieldLabel>
          <Input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={isSubmitting}
            required
            className="bg-background"
            autoComplete="new-password"
          />
          <FieldDescription>Please confirm your password.</FieldDescription>
        </Field>

        <Field>
          <Button type="submit" disabled={isSubmitting} className="w-full cursor-pointer font-medium">
            {isSubmitting ? (
              <div className="flex items-center gap-2">
                <div className="size-3.5 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                <span>Creating account...</span>
              </div>
            ) : (
              "Create Account"
            )}
          </Button>
        </Field>

        <FieldSeparator>Or continue with</FieldSeparator>

        <div className="flex flex-col gap-2">
          {/* Offline / Local Mode Option */}
          <Button
            variant="outline"
            type="button"
            onClick={handleOfflineMode}
            className="w-full cursor-pointer text-xs font-medium"
          >
            Continue in Offline Mode
          </Button>

          <FieldDescription className="px-6 text-center pt-2">
            Already have an account?{" "}
            <Link href="/login" className="underline underline-offset-4 font-medium hover:text-foreground">
              Sign in
            </Link>
          </FieldDescription>
        </div>
      </FieldGroup>
    </form>
  );
}
