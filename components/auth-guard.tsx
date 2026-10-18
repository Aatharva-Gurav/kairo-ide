"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/store";
import { KairoBrandIcon } from "@/components/kairo-brand-icon";

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const { status, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (status === "unauthenticated") {
      router.replace("/login");
    } else if (status === "onboarding-required") {
      router.replace("/onboarding");
    }
  }, [isLoading, status, router]);

  if (isLoading || status === "unauthenticated" || status === "onboarding-required") {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-background select-none">
        <div className="animate-kairo-float mb-3">
          <KairoBrandIcon size={52} className="rounded-2xl shadow-lg" />
        </div>
        <div className="flex items-center gap-2 mt-2">
          <div className="size-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <span className="text-xs text-muted-foreground font-mono">Loading Kairo IDE...</span>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

