import { describe, it, expect } from "vitest";
import { resolveEditorType } from "./editor-resolver";

describe("resolveEditorType", () => {
  it("routes .md and .markdown files to the markdown editor", () => {
    expect(resolveEditorType("README.md")).toBe("markdown");
    expect(resolveEditorType("/workspace/docs/CHANGELOG.MD")).toBe("markdown");
    expect(resolveEditorType("C:/repo/documentation.markdown")).toBe("markdown");
  });

  it("routes standard source code and config files to monaco", () => {
    expect(resolveEditorType("src/main.ts")).toBe("monaco");
    expect(resolveEditorType("src-tauri/src/app.rs")).toBe("monaco");
    expect(resolveEditorType("package.json")).toBe("monaco");
    expect(resolveEditorType("styles.css")).toBe("monaco");
    expect(resolveEditorType("unknown_ext.custom")).toBe("monaco");
  });

  it("routes recognized image, audio, and video files to media viewers", () => {
    expect(resolveEditorType("assets/logo.png")).toBe("image");
    expect(resolveEditorType("photo.webp")).toBe("image");
    expect(resolveEditorType("track.mp3")).toBe("audio");
    expect(resolveEditorType("clip.mp4")).toBe("video");
  });

  it("routes binary and oversized files to the binary viewer", () => {
    expect(resolveEditorType("app.exe", { isBinary: true })).toBe("binary");
    expect(resolveEditorType("archive.zip", { isBinary: true })).toBe("binary");
    expect(resolveEditorType("huge.log", { isTooLarge: true })).toBe("binary");
  });
});
