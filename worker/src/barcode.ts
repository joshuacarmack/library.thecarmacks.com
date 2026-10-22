/**
 * Normalizes a scanned CD/DVD barcode. UPC-A (12 digits) is the same code as an
 * EAN-13 with a leading 0, and scanners report it either way, so the 13-digit
 * form is collapsed to 12 digits. That keeps duplicate detection consistent no
 * matter which scanner read it.
 */
export function normalizeBarcode(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

/** GTIN checksum check for EAN-8, UPC-A, EAN-13, and GTIN-14 barcodes. */
export function isValidBarcode(code: string): boolean {
  if (!/^\d+$/.test(code) || ![8, 12, 13, 14].includes(code.length)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop()!;
  // Weights alternate 3,1,3,1... starting from the digit right before the check digit.
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/**
 * Turns a retail product title (as UPC databases list it) into a plain movie
 * title, e.g. "The Dark Knight (Widescreen Edition) [DVD] 2008" -> "The Dark Knight".
 * Also returns a release year if one appears in the text.
 */
export function cleanRetailTitle(raw: string): { title: string; year: number | null } {
  // Only trust a year that's in brackets or at the very end — titles like
  // "2001: A Space Odyssey" or "1917" have years that are part of the name.
  const bracketed = (raw.match(/\([^)]*\)|\[[^\]]*\]/g) ?? []).join(" ");
  const yearMatch = bracketed.match(/\b(19\d{2}|20\d{2})\b/) ?? raw.match(/\s(19\d{2}|20\d{2})\s*$/);
  // Listings put the real title first, then "[DVD]" / "(Widescreen)" and often a pile of
  // category keywords ("Goodfellas [DVD] Feature Thriller Drama..."), so keep only what's
  // before the first bracket.
  const firstBracket = raw.search(/[([]/);
  const head = firstBracket > 0 ? raw.slice(0, firstBracket) : raw;
  const title = head
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/\s(19|20)\d{2}\s*$/, " ")
    .replace(
      /\b(dvd|blu-?ray|4k|uhd|ultra hd|digital (copy|hd)|widescreen|full ?screen|(special|collector'?s|anniversary|deluxe) edition|region \d|ntsc)\b/gi,
      " "
    )
    .replace(/\s+[-–:|/,]+\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/[-–:|/,]+$/, "")
    .trim();
  return { title: title || raw.trim(), year: yearMatch ? Number(yearMatch[1]) : null };
}
