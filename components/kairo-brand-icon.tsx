"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface KairoBrandIconProps {
  className?: string;
  size?: number;
  animate?: boolean;
}

export function KairoBrandIcon({
  className,
  size = 48,
  animate = true,
}: KairoBrandIconProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/icon.png"
      alt="Kairo IDE Logo"
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        objectFit: "contain",
      }}
      className={cn(
        "shrink-0 select-none",
        animate && "animate-in fade-in-50 zoom-in-95 duration-200 ease-out",
        className
      )}
      draggable={false}
    />
  );
}
