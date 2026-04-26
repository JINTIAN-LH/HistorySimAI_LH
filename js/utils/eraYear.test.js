import { describe, expect, it } from "vitest";
import { getAbsoluteYearForEraYear } from "./eraYear.js";

describe("getAbsoluteYearForEraYear", () => {
  it("uses configured worldview absolute start year when present", () => {
    expect(getAbsoluteYearForEraYear(3, { startYear: 3, absoluteStartYear: 1129 })).toBe(1129);
    expect(getAbsoluteYearForEraYear(4, { startYear: 3, absoluteStartYear: 1129 })).toBe(1130);
  });

  it("falls back to the legacy Chongzhen offset when config is absent", () => {
    expect(getAbsoluteYearForEraYear(3, {})).toBe(1630);
  });
});