import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/auth";

describe("password hashing", () => {
  it("round-trips a correct password", async () => {
    const { hash, salt } = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash, salt)).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const { hash, salt } = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("wrong password", hash, salt)).toBe(false);
  });

  it("produces a different hash for the same password on different salts", async () => {
    const a = await hashPassword("same password");
    const b = await hashPassword("same password");
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  it("reproduces the same hash given the same password and salt", async () => {
    const first = await hashPassword("same password");
    const second = await hashPassword("same password", first.salt);
    expect(second.hash).toBe(first.hash);
  });
});
