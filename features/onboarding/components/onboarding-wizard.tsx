"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/store";
import { useSettings } from "@/features/settings/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KairoBrandIcon } from "@/components/kairo-brand-icon";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  ArrowLeft01Icon,
  CheckmarkCircle02Icon,
  PaintBoardIcon,
  FileCodeIcon,
  UserIcon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import type { ThemePreference } from "@/features/settings/types";

const AVAILABLE_LANGUAGES = [
  "TypeScript",
  "JavaScript",
  "Rust",
  "Python",
  "Go",
  "C++",
  "HTML & CSS",
  "JSON / YAML",
  "SQL",
  "Markdown",
];

const THEME_OPTIONS: { id: ThemePreference; name: string; desc: string; type: "light" | "dark" }[] = [
  { id: "light", name: "Kairo Light", desc: "Clean, high-contrast crisp day theme (Default)", type: "light" },
  { id: "dark", name: "Kairo Dark", desc: "Deep dark modern aesthetic for late night coding", type: "dark" },
  { id: "tokyo-night", name: "Tokyo Night", desc: "Vibrant neon-infused cyberpunk dark theme", type: "dark" },
  { id: "dracula", name: "Dracula", desc: "Classic gothic dark purple palette", type: "dark" },
  { id: "vs-light", name: "VS Code Light+", desc: "Familiar light editor color palette", type: "light" },
  { id: "vs-dark", name: "VS Code Dark+", desc: "Familiar default dark code color palette", type: "dark" },
];

export function OnboardingWizard() {
  const router = useRouter();
  const { user, profile, completeOnboarding, isOffline } = useAuth();
  const { settings, updateSetting } = useSettings();

  // Step state with local storage resume
  const userId = user?.id || (isOffline ? "offline" : "local");
  const stepStorageKey = `kairo.onboarding_step.${userId}`;

  const [step, setStep] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const savedStep = localStorage.getItem(stepStorageKey);
      if (savedStep) {
        const parsed = parseInt(savedStep, 10);
        if (parsed >= 1 && parsed <= 4) {
          return parsed;
        }
      }
    }
    return 1;
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [displayName, setDisplayName] = useState(
    profile?.displayName || user?.user_metadata?.full_name || ""
  );
  const [username, setUsername] = useState(
    profile?.username || (user?.email ? user.email.split("@")[0] : "")
  );
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(
    profile?.preferredLanguages?.length ? profile.preferredLanguages : ["TypeScript", "Rust"]
  );
  const [selectedTheme, setSelectedTheme] = useState<ThemePreference>(
    (settings.appearance.theme as ThemePreference) || "light"
  );
  const [tabSize, setTabSize] = useState<number>(settings.editor.tabSize || 2);
  const [wordWrap, setWordWrap] = useState<"on" | "off">(
    settings.editor.wordWrap === "on" ? "on" : "off"
  );
  const [minimap, setMinimap] = useState<boolean>(settings.editor.minimap !== false);

  // Persist active step
  const handleStepChange = (newStep: number) => {
    setStep(newStep);
    if (typeof window !== "undefined") {
      localStorage.setItem(stepStorageKey, String(newStep));
    }
  };

  const toggleLanguage = (lang: string) => {
    setSelectedLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]
    );
  };

  // Live theme change
  const handleThemeChange = (theme: ThemePreference) => {
    setSelectedTheme(theme);
    updateSetting("appearance.theme", theme, "user");
  };

  const handleFinish = async () => {
    setIsSubmitting(true);
    try {
      await completeOnboarding({
        displayName: displayName.trim() || undefined,
        username: username.trim() || undefined,
        preferredLanguages: selectedLanguages,
        themePreference: selectedTheme,
        editorPreferences: {
          tabSize,
          wordWrap,
          minimap,
        },
      });

      if (typeof window !== "undefined") {
        localStorage.removeItem(stepStorageKey);
      }

      router.push("/");
    } catch (err) {
      console.error("[Onboarding] Failed to complete onboarding:", err);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background text-foreground p-6 selection:bg-primary/20">
      <div className="w-full max-w-xl bg-card border border-border/80 rounded-2xl p-8 shadow-2xl animate-in fade-in-50 zoom-in-95 duration-200">
        {/* Header branding */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="animate-kairo-float mb-3">
            <KairoBrandIcon size={52} className="rounded-2xl shadow-lg" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Welcome to Kairo IDE</h1>
          <p className="text-xs text-muted-foreground mt-1">Let&apos;s customize your workspace in a few quick steps</p>

          {/* Stepper Progress Indicator */}
          <div className="flex items-center gap-2 mt-6">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  i === step
                    ? "w-8 bg-primary"
                    : i < step
                    ? "w-4 bg-primary/60"
                    : "w-4 bg-muted"
                )}
              />
            ))}
          </div>
        </div>

        {/* STEP 1: Profile & Identity */}
        {step === 1 && (
          <div className="space-y-5 animate-in fade-in duration-150">
            <div className="flex items-center gap-2 pb-2 border-b border-border/60">
              <HugeiconsIcon icon={UserIcon} className="size-4 text-primary" />
              <h2 className="text-sm font-semibold tracking-tight">Your Profile</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1.5">
                  Display Name
                </label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Alex Chen"
                  className="bg-background text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground block mb-1.5">
                  Username
                </label>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. alexchen"
                  className="bg-background text-xs font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-6 border-t border-border/60">
              <span className="text-[11px] text-muted-foreground">Step 1 of 4</span>
              <Button
                onClick={() => handleStepChange(2)}
                size="sm"
                className="cursor-pointer gap-1.5 font-medium"
              >
                <span>Continue</span>
                <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: Developer & Editor Preferences */}
        {step === 2 && (
          <div className="space-y-5 animate-in fade-in duration-150">
            <div className="flex items-center gap-2 pb-2 border-b border-border/60">
              <HugeiconsIcon icon={FileCodeIcon} className="size-4 text-primary" />
              <h2 className="text-sm font-semibold tracking-tight">Developer Preferences</h2>
            </div>

            {/* Languages */}
            <div>
              <label className="text-xs font-medium text-foreground block mb-2">
                Primary Languages & Technologies
              </label>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_LANGUAGES.map((lang) => {
                  const active = selectedLanguages.includes(lang);
                  return (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => toggleLanguage(lang)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-120 border cursor-pointer active:scale-95",
                        active
                          ? "bg-primary text-primary-foreground border-primary shadow-2xs font-semibold"
                          : "bg-muted/30 border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/60"
                      )}
                    >
                      {lang}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Editor Quick Settings */}
            <div className="grid grid-cols-3 gap-3 pt-2">
              <div className="p-3 rounded-lg border border-border/60 bg-muted/20">
                <span className="text-[11px] font-medium block text-foreground mb-2">Tab Size</span>
                <div className="flex gap-1.5">
                  {[2, 4].map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setTabSize(size)}
                      className={cn(
                        "flex-1 py-1 rounded text-xs font-mono font-medium border cursor-pointer active:scale-95 transition-all",
                        tabSize === size
                          ? "bg-primary text-primary-foreground border-primary font-bold shadow-2xs"
                          : "border-border/60 hover:bg-muted/50"
                      )}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 rounded-lg border border-border/60 bg-muted/20">
                <span className="text-[11px] font-medium block text-foreground mb-2">Word Wrap</span>
                <div className="flex gap-1.5">
                  {(["on", "off"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setWordWrap(mode)}
                      className={cn(
                        "flex-1 py-1 rounded text-xs capitalize font-medium border cursor-pointer active:scale-95 transition-all",
                        wordWrap === mode
                          ? "bg-primary text-primary-foreground border-primary font-bold shadow-2xs"
                          : "border-border/60 hover:bg-muted/50"
                      )}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 rounded-lg border border-border/60 bg-muted/20">
                <span className="text-[11px] font-medium block text-foreground mb-2">Minimap</span>
                <div className="flex gap-1.5">
                  {[true, false].map((active) => (
                    <button
                      key={String(active)}
                      type="button"
                      onClick={() => setMinimap(active)}
                      className={cn(
                        "flex-1 py-1 rounded text-xs font-medium border cursor-pointer active:scale-95 transition-all",
                        minimap === active
                          ? "bg-primary text-primary-foreground border-primary font-bold shadow-2xs"
                          : "border-border/60 hover:bg-muted/50"
                      )}
                    >
                      {active ? "Show" : "Hide"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-6 border-t border-border/60">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleStepChange(1)}
                className="cursor-pointer gap-1.5"
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} className="size-3.5" />
                <span>Back</span>
              </Button>
              <Button
                onClick={() => handleStepChange(3)}
                size="sm"
                className="cursor-pointer gap-1.5 font-medium"
              >
                <span>Continue</span>
                <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: Appearance & Live Theme Selection */}
        {step === 3 && (
          <div className="space-y-5 animate-in fade-in duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-border/60">
              <div className="flex items-center gap-2">
                <HugeiconsIcon icon={PaintBoardIcon} className="size-4 text-primary" />
                <h2 className="text-sm font-semibold tracking-tight">Theme & Appearance</h2>
              </div>
              <span className="text-[10px] text-primary font-medium bg-primary/10 px-2 py-0.5 rounded-full">
                Live Preview
              </span>
            </div>

            <div>
              <p className="text-xs text-muted-foreground mb-3">
                Select your preferred color theme. Changes are applied instantly.
              </p>
              <div className="grid grid-cols-2 gap-2.5 max-h-[260px] overflow-y-auto pr-1">
                {THEME_OPTIONS.map((opt) => {
                  const isSelected = selectedTheme === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleThemeChange(opt.id)}
                      className={cn(
                        "flex flex-col p-3 rounded-xl border text-left transition-all duration-140 cursor-pointer active:scale-98 relative group",
                        isSelected
                          ? "border-primary bg-primary/10 shadow-sm"
                          : "border-border/60 bg-muted/15 hover:border-primary/50 hover:bg-muted/30"
                      )}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="text-xs font-semibold tracking-tight text-foreground">
                          {opt.name}
                        </span>
                        {isSelected && (
                          <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-4 text-primary" />
                        )}
                      </div>
                      <span className="text-[10.5px] text-muted-foreground mt-1 leading-snug">
                        {opt.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between pt-6 border-t border-border/60">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleStepChange(2)}
                className="cursor-pointer gap-1.5"
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} className="size-3.5" />
                <span>Back</span>
              </Button>
              <Button
                onClick={() => handleStepChange(4)}
                size="sm"
                className="cursor-pointer gap-1.5 font-medium"
              >
                <span>Continue</span>
                <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 4: Ready to Code */}
        {step === 4 && (
          <div className="space-y-5 animate-in fade-in duration-150 text-center">
            <div className="flex flex-col items-center justify-center py-2">
              <div className="size-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3">
                <HugeiconsIcon icon={SparklesIcon} className="size-6" />
              </div>
              <h2 className="text-base font-bold tracking-tight text-foreground">
                You&apos;re All Set!
              </h2>
              <p className="text-xs text-muted-foreground max-w-sm mt-1 leading-relaxed">
                Your workspace has been tailored to your preferences. You can adjust any of these
                settings at any time using <kbd className="font-mono bg-muted px-1.5 py-0.5 rounded text-[10px]">Ctrl+,</kbd> in the IDE.
              </p>
            </div>

            {/* Summary card */}
            <div className="p-3.5 rounded-xl border border-border/60 bg-muted/20 text-xs text-left space-y-2 font-mono">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Developer:</span>
                <span className="text-foreground font-semibold">{displayName || "Developer"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Color Theme:</span>
                <span className="text-foreground font-semibold capitalize">{selectedTheme}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Languages:</span>
                <span className="text-foreground">{selectedLanguages.slice(0, 3).join(", ") || "General"}</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-6 border-t border-border/60">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleStepChange(3)}
                className="cursor-pointer gap-1.5"
                disabled={isSubmitting}
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} className="size-3.5" />
                <span>Back</span>
              </Button>
              <Button
                onClick={handleFinish}
                size="default"
                disabled={isSubmitting}
                className="cursor-pointer gap-2 font-semibold shadow-md interactive-hover"
              >
                {isSubmitting ? (
                  <>
                    <div className="size-3.5 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                    <span>Preparing Workspace...</span>
                  </>
                ) : (
                  <>
                    <span>Open Kairo IDE</span>
                    <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

