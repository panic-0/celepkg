import { describe, expect, it } from "vitest";
import { parseUnixNanosecondsToMilliseconds } from "./time";

describe("parseUnixNanosecondsToMilliseconds", () => {
  it("parses valid Unix nanoseconds", () => {
    expect(parseUnixNanosecondsToMilliseconds("1700000000123456789")).toBe(1700000000123);
  });

  it("rejects invalid and non-positive values", () => {
    expect(parseUnixNanosecondsToMilliseconds("not-a-number")).toBeNull();
    expect(parseUnixNanosecondsToMilliseconds("0")).toBeNull();
    expect(parseUnixNanosecondsToMilliseconds("-1")).toBeNull();
  });

  it("rejects timestamps outside the JavaScript Date range", () => {
    expect(parseUnixNanosecondsToMilliseconds("999999999999999999999999999999999999")).toBeNull();
  });
});
