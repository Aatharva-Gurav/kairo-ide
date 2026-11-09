import { ShellProfile } from "../types";

export interface ProfileValidationResult {
  valid: boolean;
  errors: string[];
}

export class TerminalProfileService {
  /**
   * Validates a custom shell profile structure and executable path.
   */
  static validateProfile(profile: Partial<ShellProfile>): ProfileValidationResult {
    const errors: string[] = [];

    if (!profile.name || profile.name.trim().length === 0) {
      errors.push("Profile name cannot be empty");
    }

    if (!profile.executable || profile.executable.trim().length === 0) {
      errors.push("Executable path cannot be empty");
    }

    if (profile.args && !Array.isArray(profile.args)) {
      errors.push("Arguments must be an array of strings");
    }

    if (profile.env && typeof profile.env !== "object") {
      errors.push("Environment variables must be a key-value map");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Merges OS-detected shells with user custom profiles from settings.
   */
  static mergeProfiles(
    discovered: ShellProfile[],
    custom: ShellProfile[],
    defaultProfileId?: string
  ): ShellProfile[] {
    const map = new Map<string, ShellProfile>();

    for (const d of discovered) {
      map.set(d.id, { ...d, isCustom: false });
    }

    for (const c of custom) {
      map.set(c.id, { ...c, isCustom: true });
    }

    const profiles = Array.from(map.values());

    // Update isDefault flag according to preferred defaultProfileId
    if (defaultProfileId) {
      const match = profiles.find((p) => p.id === defaultProfileId);
      if (match) {
        profiles.forEach((p) => {
          p.isDefault = p.id === defaultProfileId;
        });
      }
    }

    return profiles;
  }

  /**
   * Resolves the active default shell profile from available profiles.
   */
  static resolveDefaultProfile(
    profiles: ShellProfile[],
    preferredId?: string
  ): ShellProfile | null {
    if (profiles.length === 0) return null;

    if (preferredId) {
      const found = profiles.find((p) => p.id === preferredId);
      if (found) return found;
    }

    const markedDefault = profiles.find((p) => p.isDefault);
    return markedDefault || profiles[0];
  }
}
