import { describe, it, expect } from "vitest";
import { estimateValue, percentile, calculateFinancing } from "./calculators";
import { toSqft, fromSqft, describeSqft } from "./units";

describe("Pakistani Land Unit Conversions", () => {
  it("converts Marla to sqft with 225 sqft standard", () => {
    expect(toSqft(5, "marla", 225)).toBe(1125);
    expect(toSqft(10, "marla", 225)).toBe(2250);
    expect(toSqft(1, "kanal", 225)).toBe(4500); // 20 marlas * 225
  });

  it("converts Marla with 272 sqft Punjab revenue standard", () => {
    expect(toSqft(5, "marla", 272)).toBe(1360);
    expect(toSqft(1, "kanal", 272)).toBe(5440);
  });

  it("converts from sqft back to marla and kanal", () => {
    expect(fromSqft(1125, "marla", 225)).toBe(5);
    expect(fromSqft(4500, "kanal", 225)).toBe(1);
  });

  it("human-readable description of Pakistani property areas", () => {
    expect(describeSqft(1125, 225)).toBe("5 Marla");
    expect(describeSqft(4500, 225)).toBe("1 Kanal");
  });
});

describe("Hedonic Automated Valuation Model (AVM)", () => {
  it("computes baseline valuation with outlier trimming and confidence intervals", () => {
    // Sample price per sqft data from 10 comparable houses
    const comps = [12000, 12500, 12200, 11900, 12800, 12100, 12400, 12300, 12600, 25000]; // 25000 is an outlier
    const sqft = 2250; // 10 Marla

    const result = estimateValue(comps, sqft, {
      corner: true,
      parkFacing: true,
      condition: "brand_new",
    });

    expect(result).not.toBeNull();
    if (!result) return;

    // Outlier 25000 should be trimmed
    expect(result.sampleSize).toBe(9);
    expect(result.adjustments.length).toBe(3);

    // Sum of adjustments: 8% + 8% + 7% = 23%
    const totalAdj = result.adjustments.reduce((acc, a) => acc + a.pct, 0);
    expect(totalAdj).toBe(23);

    expect(result.estimate.avg).toBeGreaterThan(result.estimate.low);
    expect(result.estimate.high).toBeGreaterThan(result.estimate.avg);

    // 95% confidence interval must wrap around the average estimate
    expect(result.confidenceInterval95.lower).toBeLessThanOrEqual(result.estimate.avg);
    expect(result.confidenceInterval95.upper).toBeGreaterThanOrEqual(result.estimate.avg);
    expect(result.confidenceScore).toBeGreaterThan(50);
  });

  it("returns null if insufficient comparable samples", () => {
    const comps = [12000, 12500];
    expect(estimateValue(comps, 1125)).toBeNull();
  });
});

describe("Home Loan / Financing Calculator", () => {
  it("calculates monthly EMI amortization correctly with consumer cap", () => {
    const res = calculateFinancing({
      propertyPrice: 10_000_000, // 1 Crore PKR
      downPayment: 2_000_000, // 20 Lakh down, 80 Lakh financed
      tenureYears: 20,
      annualRate: 15, // 15% KIBOR + spread
      mode: "diminishing_musharakah",
    });

    expect(res.financedAmount).toBe(8_000_000);
    // Respects Pakistani 30% max profit cap over tenure
    expect(res.monthlyPayment).toBe(45833);
    expect(res.totalRepayment).toBeGreaterThan(res.financedAmount);
    expect(res.totalPaidIncludingDown).toBe(res.totalRepayment + 2_000_000);
  });
});
