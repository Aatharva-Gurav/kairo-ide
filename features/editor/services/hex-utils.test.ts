import { describe, it, expect } from "vitest";
import {
  formatHexOffset,
  formatHexByte,
  toPrintableAscii,
  parseOffsetInput,
  parseHexSearchQuery,
  encodeTextSearchQuery,
  formatSelectionAsHex,
  formatSelectionAsAscii,
} from "./hex-utils";

describe("hex-utils", () => {
  it("formats offsets, hex bytes, and printable ASCII", () => {
    expect(formatHexOffset(0)).toBe("00000000");
    expect(formatHexOffset(255)).toBe("000000FF");
    expect(formatHexByte(0x0a)).toBe("0A");
    expect(toPrintableAscii(0x41)).toBe("A");
    expect(toPrintableAscii(0x00)).toBe(".");
    expect(toPrintableAscii(0x7f)).toBe(".");
  });

  it("parses hex and decimal offset inputs", () => {
    expect(parseOffsetInput("0x10")).toBe(16);
    expect(parseOffsetInput("256")).toBe(256);
    expect(parseOffsetInput("-1")).toBeNull();
    expect(parseOffsetInput("invalid")).toBeNull();
  });

  it("parses hex and UTF-8 text search queries", () => {
    expect(parseHexSearchQuery("89 50 4E 47")).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(parseHexSearchQuery("0x48656c")).toEqual([0x48, 0x65, 0x6c]);
    expect(parseHexSearchQuery("ZZ")).toBeNull();
    expect(encodeTextSearchQuery("PNG")).toEqual([0x50, 0x4e, 0x47]);
  });

  it("formats selected byte ranges as hex and ASCII", () => {
    const sample = [0x48, 0x69, 0x00, 0x21];
    expect(formatSelectionAsHex(sample)).toBe("48 69 00 21");
    expect(formatSelectionAsAscii(sample)).toBe("Hi.!");
  });
});
