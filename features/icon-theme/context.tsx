"use client";

import React, { createContext, useContext, useMemo, useState, useCallback } from "react";
import { IconThemeContextValue, IconResolveOptions, IconDefinition } from "./types";
import { defaultTheme, iconThemes } from "./themes";
import { resolveIcon as baseResolveIcon } from "./resolver";

const fallbackContextValue: IconThemeContextValue = {
  theme: defaultTheme,
  themeId: "seti",
  setThemeId: () => {},
  resolveIcon: (options: IconResolveOptions) => baseResolveIcon(options, defaultTheme),
};

const IconThemeContext = createContext<IconThemeContextValue>(fallbackContextValue);

export interface IconThemeProviderProps {
  children: React.ReactNode;
  initialThemeId?: string;
}

export function IconThemeProvider({
  children,
  initialThemeId = "seti",
}: IconThemeProviderProps) {
  const [themeId, setThemeId] = useState<string>(initialThemeId);

  const theme = useMemo(() => {
    return iconThemes[themeId] ?? defaultTheme;
  }, [themeId]);

  const resolve = useCallback(
    (options: IconResolveOptions): IconDefinition => {
      return baseResolveIcon(options, theme);
    },
    [theme]
  );

  const value = useMemo<IconThemeContextValue>(
    () => ({
      theme,
      themeId,
      setThemeId,
      resolveIcon: resolve,
    }),
    [theme, themeId, resolve]
  );

  return (
    <IconThemeContext.Provider value={value}>
      {children}
    </IconThemeContext.Provider>
  );
}

export function useIconTheme(): IconThemeContextValue {
  return useContext(IconThemeContext);
}

