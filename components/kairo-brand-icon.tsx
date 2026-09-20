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
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={cn(
        "shrink-0",
        animate && "animate-in fade-in-50 zoom-in-95 duration-200 ease-out",
        className
      )}
      role="img"
      aria-label="Kairo IDE"
    >
      <defs>
        <linearGradient id="kairoBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1c1d24" />
          <stop offset="100%" stopColor="#0f1013" />
        </linearGradient>
        <linearGradient id="kairoPillarGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#4f46e5" />
        </linearGradient>
        <linearGradient id="kairoCyanGrad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#0284c7" />
          <stop offset="100%" stopColor="#00d8ff" />
        </linearGradient>
        <linearGradient id="kairoIndigoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#4338ca" />
        </linearGradient>
        <filter id="kairoSubtleGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="8" stdDeviation="16" floodColor="#4f46e5" floodOpacity="0.25" />
        </filter>
      </defs>

      {/* Squircle Base */}
      <rect
        x="16"
        y="16"
        width="480"
        height="480"
        rx="108"
        fill="url(#kairoBgGrad)"
        stroke="#2b2d38"
        strokeWidth="4"
      />
      <rect
        x="24"
        y="24"
        width="464"
        height="464"
        rx="100"
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth="1.5"
      />

      {/* Brand Glyph: Architectural 'K' / Editor Cursor + Code Vectors */}
      <g filter="url(#kairoSubtleGlow)">
        {/* Vertical Pillar / Cursor */}
        <rect x="120" y="116" width="52" height="280" rx="18" fill="url(#kairoPillarGrad)" />

        {/* Upper Vector (Cyan Accent) */}
        <path
          d="M214 260 L336 138 C345 129 359 129 368 138 C377 147 377 161 368 170 L262 276 Z"
          fill="url(#kairoCyanGrad)"
        />

        {/* Lower Vector (Indigo/Violet Accent) */}
        <path
          d="M214 252 L336 374 C345 383 359 383 368 374 C377 365 377 351 368 342 L262 236 Z"
          fill="url(#kairoIndigoGrad)"
        />

        {/* Nexus Core Light Dot */}
        <circle cx="238" cy="256" r="10" fill="#00d8ff" opacity="0.9" />
      </g>
    </svg>
  );
}

