import { describe, expect, it } from "vitest";
import { isValidIsbn, normalizeIsbn } from "../src/isbn";

describe("normalizeIsbn", () => {
  it("strips hyphens and spaces", () => {
    expect(normalizeIsbn("978-0-593-13520-4")).toBe("9780593135204");
    expect(normalizeIsbn("0 306 40615 2")).toBe("0306406152");
  });

  it("upper-cases the ISBN-10 check digit", () => {
    expect(normalizeIsbn("080442957x")).toBe("080442957X");
  });

  it("drops non-ISBN characters entirely", () => {
    expect(normalizeIsbn("isbn: 9780593135204!")).toBe("9780593135204");
  });

  it("returns an empty string for input with no digits", () => {
    expect(normalizeIsbn("no digits here")).toBe("");
  });
});

describe("isValidIsbn", () => {
  it("accepts a known-good ISBN-13", () => {
    expect(isValidIsbn("9780593135204")).toBe(true); // Project Hail Mary
  });

  it("accepts a known-good ISBN-10 with a numeric check digit", () => {
    expect(isValidIsbn("0306406152")).toBe(true);
  });

  it("accepts a known-good ISBN-10 with an X check digit", () => {
    expect(isValidIsbn("080442957X")).toBe(true);
  });

  it("rejects a single mistyped digit (simulating a barcode misread)", () => {
    expect(isValidIsbn("9780593135205")).toBe(false);
    expect(isValidIsbn("0306406153")).toBe(false);
  });

  it("rejects the wrong length entirely", () => {
    expect(isValidIsbn("12345")).toBe(false);
    expect(isValidIsbn("")).toBe(false);
  });

  it("rejects an ISBN-13 with a lowercase-derived stray letter", () => {
    expect(isValidIsbn("97805931352X4")).toBe(false);
  });
});
