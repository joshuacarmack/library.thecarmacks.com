/** Strips everything but digits and the ISBN-10 check character 'X', upper-cased. */
export function normalizeIsbn(raw: string): string {
  return raw.replace(/[^0-9Xx]/g, "").toUpperCase();
}

function isValidIsbn10(isbn: string): boolean {
  if (!/^\d{9}[\dX]$/.test(isbn)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (i + 1) * Number(isbn[i]);
  sum += 10 * (isbn[9] === "X" ? 10 : Number(isbn[9]));
  return sum % 11 === 0;
}

function isValidIsbn13(isbn: string): boolean {
  if (!/^\d{13}$/.test(isbn)) return false;
  let sum = 0;
  for (let i = 0; i < 13; i++) sum += Number(isbn[i]) * (i % 2 === 0 ? 1 : 3);
  return sum % 10 === 0;
}

/**
 * Checksum-validates a normalized ISBN-10 or ISBN-13 string.
 * Barcode scanners occasionally misread a digit — this catches that before wasting a
 * lookup call, without being so strict it rejects a merely-unfamiliar prefix.
 */
export function isValidIsbn(normalized: string): boolean {
  return isValidIsbn10(normalized) || isValidIsbn13(normalized);
}
