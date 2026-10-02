import { IconTheme } from "../types";
import { setiTheme } from "./seti";

export { setiTheme, setiDefinitions } from "./seti";

export const iconThemes: Record<string, IconTheme> = {
  seti: setiTheme,
};

export const defaultTheme: IconTheme = setiTheme;

