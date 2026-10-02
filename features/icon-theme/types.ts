import React from "react";

export interface IconRenderProps {
  className?: string;
  title?: string;
  style?: React.CSSProperties;
}

export interface IconDefinition {
  id: string;
  name: string;
  render: (props: IconRenderProps) => React.ReactNode;
  color?: string;
}

export interface IconPatternRule {
  id: string;
  pattern: RegExp;
  icon: IconDefinition;
}

export interface IconTheme {
  id: string;
  name: string;
  exactFiles: Record<string, IconDefinition>;
  filePatterns: IconPatternRule[];
  fileExtensions: Record<string, IconDefinition>;
  folderNames: Record<string, IconDefinition>;
  folderExpandedNames: Record<string, IconDefinition>;
  defaultFile: IconDefinition;
  defaultFolder: IconDefinition;
  defaultFolderExpanded: IconDefinition;
}

export interface IconResolveOptions {
  name: string;
  isDirectory?: boolean;
  isExpanded?: boolean;
}

export interface IconThemeContextValue {
  theme: IconTheme;
  themeId: string;
  setThemeId: (id: string) => void;
  resolveIcon: (options: IconResolveOptions) => IconDefinition;
}

