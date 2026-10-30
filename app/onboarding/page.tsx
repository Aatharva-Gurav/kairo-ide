"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/store";
import { OnboardingWizard } from "@/features/onboarding/components/onboarding-wizard";
import { KairoBrandIcon } from "@/components/kairo-brand-icon";

export default function OnboardingPage() {
  const router = useRouter();
  const { status, profile, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (status === "unauthenticated") {
      router.replace("/login");
    } else if (status === "authenticated" && profile?.onboardingCompleted) {
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

  return <OnboardingWizard />;
}

