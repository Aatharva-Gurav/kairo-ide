"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/store";
import { SignupForm } from "@/components/signup-form";
import { KairoBrandIcon } from "@/components/kairo-brand-icon";

export default function SignupPage() {
  const router = useRouter();
  const { status, profile, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (status === "authenticated") {
      if (profile && !profile.onboardingCompleted) {
        router.replace("/onboarding");
      } else {
        router.replace("/");
      }
    } else if (status === "offline") {
      router.replace("/");
    }
  }, [isLoading, status, profile, router]);

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-background select-none">
        <div className="animate-kairo-float mb-3">
          <KairoBrandIcon size={52} className="rounded-2xl shadow-lg" />
        </div>
        <div className="size-4 rounded-full border-2 border-primary border-t-transparent animate-spin mt-2" />
      </div>
    );
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-2 bg-background text-foreground">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <Link href="/" className="flex items-center gap-2.5 font-semibold text-foreground group">
            <div className="transition-transform duration-200 group-hover:scale-105">
              <KairoBrandIcon size={24} />
            </div>
            <span className="tracking-tight text-sm font-bold">Kairo IDE</span>
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            <SignupForm />
          </div>
        </div>
      </div>
      <div className="relative hidden bg-muted/30 lg:flex items-center justify-center p-12 border-l border-border/60">
        <div className="flex flex-col items-center text-center max-w-sm">
          <div className="animate-kairo-float mb-4">
            <KairoBrandIcon size={80} className="rounded-3xl shadow-2xl" />
          </div>
          <h2 className="text-lg font-bold tracking-tight text-foreground">Join Kairo IDE</h2>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            Create an account to synchronize your editor preferences, cloud settings, and developer profiles across all your workstations.
          </p>
        </div>
      </div>
    </div>
  );
}
