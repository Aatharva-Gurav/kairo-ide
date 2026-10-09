"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/store";
import { useSettings } from "@/features/settings/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KairoBrandIcon } from "@/components/kairo-brand-icon";
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Palette,
  FileCode,
  User,
  Sparkles,
} from "lucide-react";
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
  { id: "dark-modern", name: "Dark Modern", desc: "Default VS Code dark modern theme", type: "dark" },
  { id: "light-modern", name: "Light Modern", desc: "Default crisp clean light theme", type: "light" },
  { id: "dark-plus", name: "Dark+", desc: "Classic VS Code Dark+ theme", type: "dark" },
  { id: "light-plus", name: "Light+", desc: "Classic VS Code Light+ theme", type: "light" },
  { id: "vs-dark", name: "Visual Studio Dark", desc: "Familiar default dark code color palette", type: "dark" },
  { id: "vs-light", name: "Visual Studio Light", desc: "Familiar light editor color palette", type: "light" },
  { id: "midnight-blue", name: "Midnight Blue", desc: "Deep nocturnal blue palette", type: "dark" },
  { id: "graphite", name: "Graphite", desc: "Neutral monochrome palette", type: "dark" },
  { id: "forest-dark", name: "Forest Dark", desc: "Natural dark pine and emerald tones", type: "dark" },
  { id: "arctic-blue", name: "Arctic Blue", desc: "Cool crisp icy blue daylight palette", type: "light" },
  { id: "warm-sand", name: "Warm Sand", desc: "Soft earthy parchment aesthetic", type: "light" },
  { id: "mint-light", name: "Mint Light", desc: "Gentle mint-tinted readable palette", type: "light" },
  { id: "hc-dark", name: "High Contrast Dark", desc: "Maximum accessibility dark contrast", type: "dark" },
  { id: "hc-light", name: "High Contrast Light", desc: "Maximum accessibility light contrast", type: "light" },
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
    (settings.appearance.theme as ThemePreference) || "dark-modern"
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
      <div className="w-full max-w-xl bg-card/95 dark:bg-[#1e1e1e]/95 border border-border/70 dark:border-white/10 rounded-3xl p-8 md:p-9 shadow-2xl ring-1 ring-black/5 dark:ring-white/10 backdrop-blur-xl animate-in fade-in-50 zoom-in-95 duration-200">
        {/* Header branding */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="animate-kairo-float mb-3">
            <KairoBrandIcon size={54} className="rounded-2xl shadow-lg border border-primary/20 bg-primary/10" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Welcome to Kairo IDE</h1>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Let&apos;s customize your workspace in a few quick steps</p>

          {/* Stepper Progress Indicator (ChatGPT style pills) */}
          <div className="flex items-center gap-2 mt-6">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={cn(
                  "h-2 rounded-full transition-all duration-300",
                  i === step
                    ? "w-8 bg-primary shadow-xs"
                    : i < step
                    ? "w-4 bg-primary/50"
                    : "w-4 bg-muted/80"
                )}
              />
            ))}
          </div>
        </div>

        {/* STEP 1: Profile & Identity */}
        {step === 1 && (
          <div className="space-y-5 animate-in fade-in duration-150">
            <div className="flex items-center gap-2.5 pb-2.5 border-b border-border/60">
              <User className="size-4 text-primary" />
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
                  className="h-10 rounded-xl bg-background/80 border-border/70 text-xs px-3.5 focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary transition-all"
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
                  className="h-10 rounded-xl bg-background/80 border-border/70 text-xs font-mono px-3.5 focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary transition-all"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-6 border-t border-border/60">
              <span className="text-[11px] text-muted-foreground font-medium">Step 1 of 4</span>
              <Button
                onClick={() => handleStepChange(2)}
                size="sm"
                className="rounded-xl h-9 px-4 cursor-pointer gap-1.5 font-medium shadow-xs"
              >
                <span>Continue</span>
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: Developer & Editor Preferences */}
        {step === 2 && (
          <div className="space-y-5 animate-in fade-in duration-150">
            <div className="flex items-center gap-2.5 pb-2.5 border-b border-border/60">
              <FileCode className="size-4 text-primary" />
              <h2 className="text-sm font-semibold tracking-tight">Developer Preferences</h2>
            </div>

            {/* Languages */}
            <div>
              <label className="text-xs font-medium text-foreground block mb-2.5">
                Primary Languages &amp; Technologies
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
                        "px-3.5 py-2 rounded-xl text-xs font-medium transition-all duration-120 border cursor-pointer active:scale-95",
                        active
                          ? "bg-primary text-primary-foreground border-primary shadow-xs font-semibold"
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
              <div className="p-3.5 rounded-2xl border border-border/60 bg-muted/20">
                <span className="text-[11px] font-medium block text-foreground mb-2">Tab Size</span>
                <div className="flex gap-1.5">
                  {[2, 4].map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setTabSize(size)}
                      className={cn(
                        "flex-1 h-8 rounded-xl text-xs font-mono font-medium border cursor-pointer active:scale-95 transition-all flex items-center justify-center",
                        tabSize === size
                          ? "bg-primary text-primary-foreground border-primary font-bold shadow-xs"
                          : "border-border/60 hover:bg-muted/50"
                      )}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3.5 rounded-2xl border border-border/60 bg-muted/20">
                <span className="text-[11px] font-medium block text-foreground mb-2">Word Wrap</span>
                <div className="flex gap-1.5">
                  {(["on", "off"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setWordWrap(mode)}
                      className={cn(
                        "flex-1 h-8 rounded-xl text-xs capitalize font-medium border cursor-pointer active:scale-95 transition-all flex items-center justify-center",
                        wordWrap === mode
                          ? "bg-primary text-primary-foreground border-primary font-bold shadow-xs"
                          : "border-border/60 hover:bg-muted/50"
                      )}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3.5 rounded-2xl border border-border/60 bg-muted/20">
                <span className="text-[11px] font-medium block text-foreground mb-2">Minimap</span>
                <div className="flex gap-1.5">
                  {[true, false].map((active) => (
                    <button
                      key={String(active)}
                      type="button"
                      onClick={() => setMinimap(active)}
                      className={cn(
                        "flex-1 h-8 rounded-xl text-xs font-medium border cursor-pointer active:scale-95 transition-all flex items-center justify-center",
                        minimap === active
                          ? "bg-primary text-primary-foreground border-primary font-bold shadow-xs"
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
                className="rounded-xl h-9 px-4 cursor-pointer gap-1.5"
              >
                <ArrowLeft className="size-3.5" />
                <span>Back</span>
              </Button>
              <Button
                onClick={() => handleStepChange(3)}
                size="sm"
                className="rounded-xl h-9 px-4 cursor-pointer gap-1.5 font-medium shadow-xs"
              >
                <span>Continue</span>
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: Appearance & Live Theme Selection */}
        {step === 3 && (
          <div className="space-y-5 animate-in fade-in duration-150">
            <div className="flex items-center justify-between pb-2.5 border-b border-border/60">
              <div className="flex items-center gap-2.5">
                <Palette className="size-4 text-primary" />
                <h2 className="text-sm font-semibold tracking-tight">Theme &amp; Appearance</h2>
              </div>
              <span className="text-[10px] text-primary font-medium bg-primary/10 border border-primary/20 px-2.5 py-0.5 rounded-full">
                Live Preview
              </span>
            </div>

            <div>
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                Select your preferred color theme. Changes are applied instantly across the entire IDE.
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
                        "flex flex-col p-3.5 rounded-2xl border text-left transition-all duration-140 cursor-pointer active:scale-98 relative group",
                        isSelected
                          ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/20"
                          : "border-border/60 bg-muted/15 hover:border-primary/40 hover:bg-muted/30"
                      )}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="text-xs font-semibold tracking-tight text-foreground">
                          {opt.name}
                        </span>
                        {isSelected && (
                          <CheckCircle2 className="size-4 text-primary shrink-0" />
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
                className="rounded-xl h-9 px-4 cursor-pointer gap-1.5"
              >
                <ArrowLeft className="size-3.5" />
                <span>Back</span>
              </Button>
              <Button
                onClick={() => handleStepChange(4)}
                size="sm"
                className="rounded-xl h-9 px-4 cursor-pointer gap-1.5 font-medium shadow-xs"
              >
                <span>Continue</span>
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 4: Ready to Code */}
        {step === 4 && (
          <div className="space-y-5 animate-in fade-in duration-150 text-center">
            <div className="flex flex-col items-center justify-center py-2">
              <div className="size-14 rounded-3xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center mb-3.5 shadow-sm">
                <Sparkles className="size-6" />
              </div>
              <h2 className="text-base font-bold tracking-tight text-foreground">
                You&apos;re All Set!
              </h2>
              <p className="text-xs text-muted-foreground max-w-sm mt-1.5 leading-relaxed">
                Your workspace has been tailored to your preferences. You can adjust any of these
                settings at any time using <kbd className="font-mono bg-muted/80 border border-border/70 px-1.5 py-0.5 rounded-md text-[10px]">Ctrl+,</kbd> in the IDE.
              </p>
            </div>

            {/* Summary card */}
            <div className="p-4 rounded-2xl border border-border/60 bg-muted/20 text-xs text-left space-y-2.5 font-mono">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Developer:</span>
                <span className="text-foreground font-semibold">{displayName || "Developer"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Color Theme:</span>
                <span className="text-foreground font-semibold capitalize">{selectedTheme}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Languages:</span>
                <span className="text-foreground">{selectedLanguages.slice(0, 3).join(", ") || "General"}</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-6 border-t border-border/60">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleStepChange(3)}
                className="rounded-xl h-9 px-4 cursor-pointer gap-1.5"
                disabled={isSubmitting}
              >
                <ArrowLeft className="size-3.5" />
                <span>Back</span>
              </Button>
              <Button
                onClick={handleFinish}
                size="default"
                disabled={isSubmitting}
                className="rounded-xl h-10 px-5 cursor-pointer gap-2 font-semibold shadow-md interactive-hover"
              >
                {isSubmitting ? (
                  <>
                    <div className="size-3.5 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                    <span>Preparing Workspace...</span>
                  </>
                ) : (
                  <>
                    <span>Open Kairo IDE</span>
                    <ArrowRight className="size-4" />
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

