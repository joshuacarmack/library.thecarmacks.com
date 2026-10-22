import { describe, expect, it } from "vitest";
import { cleanRetailTitle, isValidBarcode, normalizeBarcode } from "../src/barcode";

describe("normalizeBarcode", () => {
  it("strips non-digits", () => {
    expect(normalizeBarcode("7 24384 26091 0")).toBe("724384260910");
  });

  it("collapses a 13-digit EAN with a leading 0 to the 12-digit UPC", () => {
    expect(normalizeBarcode("0724384260910")).toBe("724384260910");
  });

  it("leaves a real EAN-13 alone", () => {
    expect(normalizeBarcode("5099749534728")).toBe("5099749534728");
  });
});

describe("isValidBarcode", () => {
  it("accepts valid UPC-A and EAN-13 codes", () => {
    expect(isValidBarcode("724384260910")).toBe(true);
    expect(isValidBarcode("0724384260910")).toBe(true);
    expect(isValidBarcode("9780593135204")).toBe(true);
  });

  it("rejects a bad check digit or wrong length", () => {
    expect(isValidBarcode("724384260911")).toBe(false);
    expect(isValidBarcode("12345")).toBe(false);
  });
});

describe("cleanRetailTitle", () => {
  it("strips retail packaging words and pulls the year from brackets", () => {
    expect(cleanRetailTitle("The Dark Knight (Widescreen Edition) [DVD] (2008)")).toEqual({ title: "The Dark Knight", year: 2008 });
  });

  it("drops the keyword pile some listings put after the bracket", () => {
    expect(cleanRetailTitle("Goodfellas [DVD]  Feature Thriller Drama  Action  Suspense").title).toBe("Goodfellas");
  });

  it("keeps years and words that are part of the title", () => {
    expect(cleanRetailTitle("2001: A Space Odyssey [DVD]").title).toBe("2001: A Space Odyssey");
    expect(cleanRetailTitle("1917 (DVD)").title).toBe("1917");
    expect(cleanRetailTitle("Bee Movie - DVD").title).toBe("Bee Movie");
  });
});
