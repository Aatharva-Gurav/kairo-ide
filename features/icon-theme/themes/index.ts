import { IconTheme } from "../types";
import { simpleIconsTheme, simpleIconsDefinitions } from "./simple-icons";

export { simpleIconsTheme, simpleIconsDefinitions } from "./simple-icons";

export const iconThemes: Record<string, IconTheme> = {
  "simple-icons": simpleIconsTheme,
};

export const defaultTheme: IconTheme = simpleIconsTheme;
