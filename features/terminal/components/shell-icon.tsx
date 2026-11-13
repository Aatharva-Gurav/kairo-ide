"use client";

import React from "react";
import {
  SiShell,
  SiGnometerminal,
  SiGnubash,
  SiZsh,
  SiFishshell,
  SiNushell,
  SiUbuntu,
  SiGitforwindows,
  SiGit,
  SiLinux,
} from "@icons-pack/react-simple-icons";
import { cn } from "@/lib/utils";

interface ShellIconProps {
  name?: string;
  className?: string;
  size?: number;
}

export function ShellIcon({ name = "", className, size = 14 }: ShellIconProps) {
  const lower = name.toLowerCase();

  // PowerShell / pwsh
  if (lower.includes("powershell") || lower.includes("pwsh")) {
    return <SiShell size={size} className={cn("text-[#5391FE] shrink-0", className)} />;
  }

  // Windows Command Prompt / cmd
  if (lower.includes("command prompt") || lower.includes("cmd")) {
    return <SiShell size={size} className={cn("text-[#F59E0B] shrink-0", className)} />;
  }

  // Git Bash / Git for Windows
  if (lower.includes("git bash") || lower.includes("git-bash") || lower.includes("git for windows")) {
    return <SiGitforwindows size={size} className={cn("text-[#F05032] shrink-0", className)} />;
  }

  // Generic Git
  if (lower.includes("git")) {
    return <SiGit size={size} className={cn("text-[#F05032] shrink-0", className)} />;
  }

  // Bash / GNU Bash
  if (lower.includes("bash")) {
    return <SiGnubash size={size} className={cn("text-[#4EAA25] shrink-0", className)} />;
  }

  // Zsh
  if (lower.includes("zsh")) {
    return <SiZsh size={size} className={cn("text-[#D2DE04] shrink-0", className)} />;
  }

  // Fish shell
  if (lower.includes("fish")) {
    return <SiFishshell size={size} className={cn("text-[#00C6FF] shrink-0", className)} />;
  }

  // Nu shell
  if (lower.includes("nu") || lower.includes("nushell")) {
    return <SiNushell size={size} className={cn("text-[#3AA675] shrink-0", className)} />;
  }

  // Ubuntu
  if (lower.includes("ubuntu")) {
    return <SiUbuntu size={size} className={cn("text-[#E95420] shrink-0", className)} />;
  }

  // Linux / WSL
  if (lower.includes("linux") || lower.includes("wsl")) {
    return <SiLinux size={size} className={cn("text-[#FCC624] shrink-0", className)} />;
  }

  // Terminal generic
  if (lower.includes("terminal")) {
    return <SiGnometerminal size={size} className={cn("text-primary shrink-0", className)} />;
  }

  // Default shell
  return <SiShell size={size} className={cn("text-primary shrink-0", className)} />;
}
