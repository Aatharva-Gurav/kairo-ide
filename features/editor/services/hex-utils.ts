/**
 * Pure formatting and parsing utilities for the Hexadecimal Binary Viewer.
 */

export const BYTES_PER_ROW = 16;

export function formatHexOffset(offset: number, width = 8): string {
  const safe = Math.max(0, Math.floor(offset));
  return safe.toString(16).toUpperCase().padStart(width, "0");
}

export function formatHexByte(byte: number): string {
  return (byte & 0xff).toString(16).toUpperCase().padStart(2, "0");
}

export function toPrintableAscii(byte: number): string {
  return byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : ".";
}

/**
 * Parses an offset string (supports `0x...` hexadecimal or plain decimal).
 */
export function parseOffsetInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^0x[0-9a-fA-F]+$/i.test(trimmed)) {
    const val = Number.parseInt(trimmed.slice(2), 16);
    return Number.isSafeInteger(val) && val >= 0 ? val : null;
  }
  if (/^\d+$/.test(trimmed)) {
    const val = Number.parseInt(trimmed, 10);
    return Number.isSafeInteger(val) && val >= 0 ? val : null;
  }
  return null;
}

/**
 * Parses a hexadecimal byte sequence like "89 50 4E 47" or "89504e47".
 * Returns null if the input is not valid hex bytes.
 */
export function parseHexSearchQuery(raw: string): number[] | null {
  const cleaned = raw.replace(/0x/gi, "").replace(/[\s,:-]+/g, "");
  if (!cleaned || cleaned.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(cleaned)) {
    return null;
  }
  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i += 2) {
    bytes.push(Number.parseInt(cleaned.slice(i, i + 2), 16));
  }
  return bytes;
}

export function encodeTextSearchQuery(raw: string): number[] {
  if (!raw) return [];
  return Array.from(new TextEncoder().encode(raw));
}

export function formatSelectionAsHex(bytes: number[]): string {
  return bytes.map(formatHexByte).join(" ");
}

export function formatSelectionAsAscii(bytes: number[]): string {
  return bytes.map(toPrintableAscii).join("");
}
