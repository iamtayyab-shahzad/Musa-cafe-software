import { describe, expect, it } from "vitest";
import { formatPkPhone, isValidPkPhone, normalizePkPhone } from "./utils";

describe("normalizePkPhone", () => {
  it("keeps a valid local number as-is", () => {
    expect(normalizePkPhone("03001234567")).toBe("03001234567");
  });

  it("strips separators and spaces", () => {
    expect(normalizePkPhone("0300-123 4567")).toBe("03001234567");
  });

  it("converts +92 international format to local", () => {
    expect(normalizePkPhone("+923001234567")).toBe("03001234567");
  });

  it("converts 92 prefix to local", () => {
    expect(normalizePkPhone("923001234567")).toBe("03001234567");
  });

  it("prefixes a leading zero for 10-digit 3XX numbers", () => {
    expect(normalizePkPhone("3001234567")).toBe("03001234567");
  });

  it("caps length at 11 digits", () => {
    expect(normalizePkPhone("030012345679999")).toBe("03001234567");
  });
});

describe("isValidPkPhone", () => {
  it("accepts an 11-digit number starting with 03", () => {
    expect(isValidPkPhone("03001234567")).toBe(true);
    expect(isValidPkPhone("0300-1234567")).toBe(true);
    expect(isValidPkPhone("+923001234567")).toBe(true);
  });

  it("rejects numbers that are too short", () => {
    expect(isValidPkPhone("0300123")).toBe(false);
  });

  it("rejects numbers that do not start with 03", () => {
    expect(isValidPkPhone("04001234567")).toBe(false);
    expect(isValidPkPhone("12345678901")).toBe(false);
  });

  it("rejects empty input", () => {
    expect(isValidPkPhone("")).toBe(false);
  });
});

describe("formatPkPhone", () => {
  it("inserts a dash after the 4th digit", () => {
    expect(formatPkPhone("03001234567")).toBe("0300-1234567");
  });

  it("does not add a dash for short partial input", () => {
    expect(formatPkPhone("0300")).toBe("0300");
    expect(formatPkPhone("030")).toBe("030");
  });

  it("formats progressively as the user types", () => {
    expect(formatPkPhone("03001")).toBe("0300-1");
  });
});
