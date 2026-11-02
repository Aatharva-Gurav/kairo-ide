import { z } from "zod";

export const SidecarConfigSchema = z.object({
  port: z
    .number({
      required_error: "Missing required argument --port",
      invalid_type_error: "Port must be a valid integer number",
    })
    .int("Port must be an integer")
    .min(0, "Port must be >= 0")
    .max(65535, "Port must be <= 65535"),
  approvalToken: z
    .string({
      required_error: "Missing required argument --approval-token",
    })
    .min(8, "Approval token must be at least 8 characters long"),
  workspace: z.string().optional(),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
  fetchImpl: z.custom<typeof fetch>().optional(),
});

export type SidecarConfig = z.infer<typeof SidecarConfigSchema>;
