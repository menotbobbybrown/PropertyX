/**
 * Financial calculators. All functions are pure and deterministic so they can run
 * on the server (API), in the browser (instant UI feedback) and in tests.
 * Every result is an estimate — the UI must label it as such.
 */

import { isUAE } from "./country";
import { UAE_FINANCING_PRODUCTS } from "./uae";

const round = (n: number) => Math.round(n);

/* ------------------------------------------------------------------ */
/* Home financing                                                       */
/* ------------------------------------------------------------------ */

export type FinancingMode = "conventional" | "diminishing_musharakah" | "ijarah" | "murabaha";

export interface FinancingProduct {
  key: string;
  name: string;
  mode: FinancingMode;
  /** Annual profit / interest rate in percent, used as default in the calculator */
  defaultRate: number;
  maxTenureYears: number;
  /** Maximum financing as % of property value */
  maxFinancingPct: number;
  description: string;
}

/** Defaults are editable by admins (site setting `financing_products`). */
export const DEFAULT_FINANCING_PRODUCTS: FinancingProduct[] = [
  {
    key: "conventional",
    name: "Conventional Home Loan",
    mode: "conventional",
    defaultRate: 14,
    maxTenureYears: 25,
    maxFinancingPct: 85,
    description: "Interest-based amortising loan. Rate usually linked to KIBOR plus a bank spread.",
  },
  {
    key: "diminishing_musharakah",
    name: "Diminishing Musharakah (Islamic)",
    mode: "diminishing_musharakah",
    defaultRate: 14,
    maxTenureYears: 25,
    maxFinancingPct: 85,
    description:
      "Joint ownership: the bank's share is bought back unit-by-unit while you pay rent on the bank's remaining share.",
  },
  {
    key: "ijarah",
    name: "Ijarah (Islamic Lease)",
    mode: "ijarah",
    defaultRate: 14.5,
    maxTenureYears: 20,
    maxFinancingPct: 80,
    description: "Bank owns and leases the property to you; ownership transfers at the end of the lease term.",
  },
  {
    key: "murabaha",
    name: "Murabaha (Cost-plus Sale)",
    mode: "murabaha",
    defaultRate: 13,
    maxTenureYears: 15,
    maxFinancingPct: 80,
    description: "Bank buys and sells the property to you at a disclosed fixed profit, paid in equal installments.",
  },
];

/** Products for this deployment: the admin-saved list when it belongs to this market, else the defaults. */
export function financingProductsFor(saved: FinancingProduct[] | null | undefined): FinancingProduct[] {
  const defaults = isUAE ? UAE_FINANCING_PRODUCTS : DEFAULT_FINANCING_PRODUCTS;
  if (!Array.isArray(saved) || !saved.length) return defaults;
  // a UAE database created from the Pakistani defaults still holds the Pakistani products
  const savedIsUae = saved.some((p) => p.key.startsWith("ae_"));
  return savedIsUae === isUAE ? saved : defaults;
}

export interface FinancingInput {
  propertyPrice: number;
  downPayment: number;
  annualRate: number; // percent
  tenureYears: number;
  mode: FinancingMode;
}

export interface FinancingScheduleRow {
  month: number;
  payment: number;
  /** interest (conventional) or rent / profit (Islamic modes) */
  profit: number;
  /** principal (conventional) or equity / ownership purchase (Islamic modes) */
  principal: number;
  balance: number;
}

export interface FinancingResult {
  financedAmount: number;
  monthlyPayment: number;
  totalRepayment: number;
  totalFinancingCost: number;
  totalPaidIncludingDown: number;
  labels: { profit: string; principal: string };
  yearly: { year: number; profit: number; principal: number; balance: number }[];
  schedule: FinancingScheduleRow[];
}

/** Upper limit on total interest / profit, as a percentage of the property price. */
export const FINANCING_MAX_PROFIT_PCT = 30;

export function calculateFinancing(input: FinancingInput): FinancingResult {
  const P = Math.max(0, input.propertyPrice - input.downPayment);
  const n = Math.max(1, Math.round(input.tenureYears * 12));
  const r = input.annualRate / 100 / 12;
  const schedule: FinancingScheduleRow[] = [];
  let monthly: number;

  if (input.mode === "murabaha") {
    // flat disclosed profit on the original amount, spread evenly
    const totalProfit = P * (input.annualRate / 100) * input.tenureYears;
    monthly = (P + totalProfit) / n;
    let balance = P;
    const profitPart = totalProfit / n;
    for (let m = 1; m <= n; m++) {
      const principal = monthly - profitPart;
      balance = Math.max(0, balance - principal);
      schedule.push({ month: m, payment: monthly, profit: profitPart, principal, balance });
    }
  } else {
    // Conventional, Diminishing Musharakah and Ijarah are priced as equal-payment
    // amortisation at the stated rate; for the Islamic modes the "interest" column
    // represents rent on the bank's share and "principal" the equity buy-back.
    monthly = r === 0 ? P / n : (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    let balance = P;
    for (let m = 1; m <= n; m++) {
      const profit = balance * r;
      const principal = monthly - profit;
      balance = Math.max(0, balance - principal);
      schedule.push({ month: m, payment: monthly, profit, principal, balance });
    }
  }

  // Total interest / profit never exceeds FINANCING_MAX_PROFIT_PCT of the property price.
  // When the cap applies, it is spread evenly with equal principal, so installments stay equal.
  // (Pakistan only — UAE mortgages are plain amortising loans.)
  const cap = (input.propertyPrice * FINANCING_MAX_PROFIT_PCT) / 100;
  if (!isUAE && monthly * n - P > cap) {
    monthly = (P + cap) / n;
    schedule.length = 0;
    let balance = P;
    for (let m = 1; m <= n; m++) {
      balance = Math.max(0, balance - P / n);
      schedule.push({ month: m, payment: monthly, profit: cap / n, principal: P / n, balance });
    }
  }

  const totalRepayment = monthly * n;
  const yearly: FinancingResult["yearly"] = [];
  for (let y = 0; y < Math.ceil(n / 12); y++) {
    const rows = schedule.slice(y * 12, y * 12 + 12);
    yearly.push({
      year: y + 1,
      profit: round(rows.reduce((s, x) => s + x.profit, 0)),
      principal: round(rows.reduce((s, x) => s + x.principal, 0)),
      balance: round(rows[rows.length - 1].balance),
    });
  }
  const islamic = input.mode !== "conventional";
  return {
    financedAmount: round(P),
    monthlyPayment: round(monthly),
    totalRepayment: round(totalRepayment),
    totalFinancingCost: round(totalRepayment - P),
    totalPaidIncludingDown: round(totalRepayment + input.downPayment),
    labels: islamic
      ? { profit: input.mode === "murabaha" ? "Profit" : "Rent / Profit", principal: "Equity Purchase" }
      : { profit: "Interest", principal: "Principal" },
    yearly,
    schedule: schedule.map((s) => ({ ...s, payment: round(s.payment), profit: round(s.profit), principal: round(s.principal), balance: round(s.balance) })),
  };
}

/* ------------------------------------------------------------------ */
/* Installment / payment plan                                           */
/* ------------------------------------------------------------------ */

export interface InstallmentInput {
  totalPrice: number;
  downPayment: number;
  durationMonths: number;
  /** If omitted the monthly installment is solved so the plan fully pays off. */
  monthlyInstallment?: number;
  /** Optional extra amount due every 3rd month (common in Pakistani project plans). */
  quarterlyInstallment?: number;
  /** Optional lump sum (e.g. on possession). Due at `balloonMonth` (default: last month). */
  balloonPayment?: number;
  balloonMonth?: number;
  startDate?: string; // ISO date for schedule labels
}

export interface InstallmentRow {
  index: number;
  month: number;
  dueDate: string;
  label: string;
  amount: number;
  paidToDate: number;
  remaining: number;
}

export interface InstallmentResult {
  schedule: InstallmentRow[];
  totalPayable: number;
  monthlyInstallment: number;
  quarterlyInstallment: number;
  balloonPayment: number;
  /** Amount still unpaid after the schedule (positive = plan under-funded) */
  remainingBalance: number;
  /** Amount over the price (negative remaining) */
  overpayment: number;
  warnings: string[];
}

function addMonths(iso: string, months: number) {
  const d = new Date(iso);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function calculateInstallmentPlan(input: InstallmentInput): InstallmentResult {
  const warnings: string[] = [];
  const months = Math.max(1, Math.round(input.durationMonths));
  const quarterlyCount = Math.floor(months / 3);
  const quarterly = Math.max(0, input.quarterlyInstallment ?? 0);
  const balloon = Math.max(0, input.balloonPayment ?? 0);
  const balloonMonth = Math.min(months, Math.max(1, input.balloonMonth ?? months));
  const afterDown = input.totalPrice - input.downPayment;
  if (input.downPayment > input.totalPrice) warnings.push("Down payment exceeds the total price.");

  let monthly = input.monthlyInstallment;
  const solved = monthly == null || monthly <= 0;
  if (solved) monthly = Math.max(0, (afterDown - quarterly * quarterlyCount - balloon) / months);
  monthly = Math.round(monthly!);
  // a solved plan absorbs the rounding difference in the last monthly installment so it pays off exactly
  const lastMonthly = solved && monthly > 0 ? Math.max(0, afterDown - quarterly * quarterlyCount - balloon - monthly * (months - 1)) : monthly;

  const start = input.startDate ?? new Date().toISOString().slice(0, 10);
  const schedule: InstallmentRow[] = [];
  let paid = 0;
  let idx = 0;
  const push = (month: number, label: string, amount: number) => {
    if (amount <= 0) return;
    paid += amount;
    schedule.push({
      index: ++idx,
      month,
      dueDate: addMonths(start, month),
      label,
      amount: Math.round(amount),
      paidToDate: Math.round(paid),
      remaining: Math.round(input.totalPrice - paid),
    });
  };
  push(0, "Down payment", input.downPayment);
  for (let m = 1; m <= months; m++) {
    push(m, `Monthly installment ${m}`, m === months ? lastMonthly : monthly);
    if (quarterly > 0 && m % 3 === 0) push(m, `Quarterly installment ${m / 3}`, quarterly);
    if (balloon > 0 && m === balloonMonth) push(m, "Balloon / possession payment", balloon);
  }
  const remaining = input.totalPrice - paid;
  if (remaining > 1) warnings.push(`The plan leaves PKR ${Math.round(remaining).toLocaleString("en-IN")} unpaid.`);
  if (remaining < -1) warnings.push(`The plan pays PKR ${Math.round(-remaining).toLocaleString("en-IN")} more than the price.`);
  return {
    schedule,
    totalPayable: Math.round(paid),
    monthlyInstallment: monthly,
    quarterlyInstallment: quarterly,
    balloonPayment: balloon,
    remainingBalance: Math.max(0, Math.round(remaining)),
    overpayment: Math.max(0, Math.round(-remaining)),
    warnings,
  };
}

/* ------------------------------------------------------------------ */
/* Investment analyser                                                  */
/* ------------------------------------------------------------------ */

export type DevelopmentStatus = "developed" | "developing" | "undeveloped";

export interface InvestmentInput {
  purchasePrice: number;
  monthlyRent: number;
  areaSqft?: number;
  developmentStatus: DevelopmentStatus;
  holdingYears: number;
  appreciationPct: number; // expected annual %
  rentGrowthPct?: number; // annual rent increase %, default 5
  vacancyPct?: number; // % of year vacant, default 8
  maintenancePct?: number; // % of annual rent, default 10
  annualTaxesAndFees?: number; // PKR, default 0.15% of price
  buyingCostPct?: number; // stamp duty / transfer / CVT etc. default 4%
  sellingCostPct?: number; // commission / advance tax, default 2%
  financing?: { downPaymentPct: number; annualRate: number; tenureYears: number } | null;
}

export type InvestmentGrade = "Excellent" | "Good" | "Average" | "Risky";

export interface InvestmentResult {
  grossRentalYield: number;
  netRentalYield: number;
  annualNetRent: number;
  annualDebtService: number;
  annualCashFlow: number;
  cashInvested: number;
  futureValue: number;
  capitalAppreciation: number;
  totalCashFlow: number;
  totalReturn: number;
  roi: number;
  annualisedReturn: number;
  breakEvenYears: number | null;
  pricePerSqft: number | null;
  score: number;
  grade: InvestmentGrade;
  factors: { label: string; impact: "positive" | "neutral" | "negative"; detail: string }[];
  yearly: { year: number; propertyValue: number; netRent: number; cashFlow: number; cumulativeProfit: number }[];
}

export function analyseInvestment(input: InvestmentInput): InvestmentResult {
  const vacancy = (input.vacancyPct ?? 8) / 100;
  const maint = (input.maintenancePct ?? 10) / 100;
  const rentGrowth = (input.rentGrowthPct ?? 5) / 100;
  const taxes = input.annualTaxesAndFees ?? input.purchasePrice * 0.0015;
  const buyCost = input.purchasePrice * ((input.buyingCostPct ?? 4) / 100);
  const appreciation = input.appreciationPct / 100;
  const years = Math.max(1, Math.round(input.holdingYears));

  let equityIn = input.purchasePrice;
  let annualDebtService = 0;
  let loanBalanceAt = (_year: number) => 0;
  if (input.financing && input.financing.downPaymentPct < 100) {
    const down = (input.purchasePrice * input.financing.downPaymentPct) / 100;
    const fin = calculateFinancing({
      propertyPrice: input.purchasePrice,
      downPayment: down,
      annualRate: input.financing.annualRate,
      tenureYears: input.financing.tenureYears,
      mode: "conventional",
    });
    annualDebtService = fin.monthlyPayment * 12;
    equityIn = down;
    loanBalanceAt = (year: number) => (year * 12 >= fin.schedule.length ? 0 : fin.schedule[year * 12 - 1].balance);
  }
  const cashInvested = equityIn + buyCost;

  const grossAnnualRent = input.monthlyRent * 12;
  const annualNetRent = grossAnnualRent * (1 - vacancy) * (1 - maint) - taxes;
  const yearly: InvestmentResult["yearly"] = [];
  let totalCashFlow = 0;
  let breakEvenYears: number | null = null;
  let cumCash = 0;
  const sellingPct = (input.sellingCostPct ?? 2) / 100;
  /** Profit if the property were sold at the end of year y (after loan payoff and all costs). */
  const profitIfSold = (y: number, cumulativeCash: number) => {
    const value = input.purchasePrice * Math.pow(1 + appreciation, y);
    return cumulativeCash + (value - loanBalanceAt(y)) - value * sellingPct - equityIn - buyCost;
  };
  for (let y = 1; y <= years + 30 && (y <= years || breakEvenYears == null); y++) {
    const rent = grossAnnualRent * Math.pow(1 + rentGrowth, y - 1) * (1 - vacancy) * (1 - maint) - taxes;
    const debt = input.financing && y <= input.financing.tenureYears ? annualDebtService : 0;
    const cashFlow = rent - debt;
    cumCash += cashFlow;
    if (y <= years) totalCashFlow += cashFlow;
    const cumulativeProfit = profitIfSold(y, cumCash);
    if (breakEvenYears == null && cumulativeProfit >= 0) breakEvenYears = y;
    if (y <= years)
      yearly.push({ year: y, propertyValue: round(input.purchasePrice * Math.pow(1 + appreciation, y)), netRent: round(rent), cashFlow: round(cashFlow), cumulativeProfit: round(cumulativeProfit) });
  }

  const futureValue = input.purchasePrice * Math.pow(1 + appreciation, years);
  const capitalAppreciation = futureValue - input.purchasePrice;
  const totalReturn = profitIfSold(years, totalCashFlow);
  const roi = (totalReturn / cashInvested) * 100;
  const annualisedReturn = (Math.pow(Math.max(0.0001, (cashInvested + totalReturn) / cashInvested), 1 / years) - 1) * 100;
  const grossRentalYield = input.purchasePrice > 0 ? (grossAnnualRent / input.purchasePrice) * 100 : 0;
  const netRentalYield = input.purchasePrice > 0 ? (annualNetRent / input.purchasePrice) * 100 : 0;

  // ---- scoring (0-100) ----
  const factors: InvestmentResult["factors"] = [];
  let score = 50;
  if (netRentalYield >= 6) {
    score += 15;
    factors.push({ label: "Rental yield", impact: "positive", detail: `Net yield of ${netRentalYield.toFixed(1)}% is strong for Pakistan's residential market.` });
  } else if (netRentalYield >= 3.5) {
    score += 6;
    factors.push({ label: "Rental yield", impact: "neutral", detail: `Net yield of ${netRentalYield.toFixed(1)}% is typical.` });
  } else {
    score -= input.monthlyRent > 0 ? 6 : 10;
    factors.push({ label: "Rental yield", impact: "negative", detail: input.monthlyRent > 0 ? `Net yield of ${netRentalYield.toFixed(1)}% is low; returns rely on appreciation.` : "No rental income — returns depend entirely on appreciation." });
  }
  if (annualisedReturn >= 15) {
    score += 18;
    factors.push({ label: "Annualised return", impact: "positive", detail: `${annualisedReturn.toFixed(1)}% per year on cash invested.` });
  } else if (annualisedReturn >= 9) {
    score += 8;
    factors.push({ label: "Annualised return", impact: "neutral", detail: `${annualisedReturn.toFixed(1)}% per year on cash invested.` });
  } else {
    score -= 10;
    factors.push({ label: "Annualised return", impact: "negative", detail: `${annualisedReturn.toFixed(1)}% per year may not beat inflation or bank deposits.` });
  }
  if (input.developmentStatus === "developed") {
    score += 8;
    factors.push({ label: "Development status", impact: "positive", detail: "Developed area — lower delivery risk and immediate rental demand." });
  } else if (input.developmentStatus === "developing") {
    factors.push({ label: "Development status", impact: "neutral", detail: "Developing area — appreciation potential with moderate delivery risk." });
  } else {
    score -= 12;
    factors.push({ label: "Development status", impact: "negative", detail: "Undeveloped area — possession timelines and approvals carry significant risk." });
  }
  if (input.appreciationPct > 20) {
    score -= 8;
    factors.push({ label: "Appreciation assumption", impact: "negative", detail: `${input.appreciationPct}% a year is an aggressive assumption; sustained rates this high are uncommon.` });
  }
  if (input.financing && annualDebtService > annualNetRent) {
    score -= 8;
    factors.push({ label: "Cash flow", impact: "negative", detail: "Financing payments exceed net rent — you will need to top up every month." });
  } else if (totalCashFlow > 0) {
    score += 4;
    factors.push({ label: "Cash flow", impact: "positive", detail: "Positive annual cash flow after expenses." });
  }
  if (breakEvenYears != null && breakEvenYears <= 3) score += 5;
  score = Math.max(0, Math.min(100, Math.round(score)));
  const grade: InvestmentGrade = score >= 75 ? "Excellent" : score >= 60 ? "Good" : score >= 45 ? "Average" : "Risky";

  return {
    grossRentalYield,
    netRentalYield,
    annualNetRent: round(annualNetRent),
    annualDebtService: round(annualDebtService),
    annualCashFlow: round(annualNetRent - annualDebtService),
    cashInvested: round(cashInvested),
    futureValue: round(futureValue),
    capitalAppreciation: round(capitalAppreciation),
    totalCashFlow: round(totalCashFlow),
    totalReturn: round(totalReturn),
    roi,
    annualisedReturn,
    breakEvenYears,
    pricePerSqft: input.areaSqft ? input.purchasePrice / input.areaSqft : null,
    score,
    grade,
    factors,
    yearly,
  };
}

/* ------------------------------------------------------------------ */
/* Construction cost                                                    */
/* ------------------------------------------------------------------ */

export type FinishingQuality = "basic" | "standard" | "premium" | "luxury";

/** Rates in PKR. Admins edit these in the admin panel (table `construction_rates`). */
export interface ConstructionRates {
  greyStructurePerSqft: number;
  finishingPerSqft: Record<FinishingQuality, number>;
  electricalPerSqft: Record<FinishingQuality, number>;
  plumbingPerSqft: Record<FinishingQuality, number>;
  woodworkPerSqft: Record<FinishingQuality, number>;
  kitchenPerUnit: Record<FinishingQuality, number>;
  bathroomPerUnit: Record<FinishingQuality, number>;
  laborPerSqft: number;
  /** City cost multiplier, e.g. Islamabad 1.08 */
  cityMultiplier: number;
  /** Date the rates were last reviewed (shown to users) */
  effectiveDate: string;
}

export interface ConstructionInput {
  plotSizeSqft: number;
  coveredAreaSqft?: number;
  floors: number;
  houseType: "single_unit" | "double_unit" | "basement_house";
  finishing: FinishingQuality;
  bathrooms?: number;
  kitchens?: number;
}

export interface ConstructionResult {
  coveredAreaSqft: number;
  bathrooms: number;
  kitchens: number;
  items: { key: string; label: string; amount: number; share: number }[];
  total: number;
  perSqft: number;
  rangeLow: number;
  rangeHigh: number;
}

/** Flat amount taken off the construction estimate for each storey (PKR 50 lakh). */
export const CONSTRUCTION_DEDUCTION_PER_FLOOR = 5_000_000;

export function estimateConstructionCost(input: ConstructionInput, rates: ConstructionRates): ConstructionResult {
  const floors = Math.max(1, Math.round(input.floors));
  // Typical by-laws allow roughly 70-80% ground coverage on small plots; use 75% when not given.
  const covered = input.coveredAreaSqft && input.coveredAreaSqft > 0 ? input.coveredAreaSqft : Math.round(input.plotSizeSqft * 0.75 * floors) + (input.houseType === "basement_house" ? Math.round(input.plotSizeSqft * 0.6) : 0);
  const units = input.houseType === "double_unit" ? 2 : 1;
  const bathrooms = input.bathrooms ?? Math.max(2, Math.round(covered / 550));
  const kitchens = input.kitchens ?? units;
  const q = input.finishing;
  const m = rates.cityMultiplier;
  const basementPremium = input.houseType === "basement_house" ? 1.08 : 1;
  const items = [
    { key: "grey_structure", label: "Grey Structure", amount: covered * rates.greyStructurePerSqft * basementPremium },
    { key: "finishing", label: "Finishing (tiles, paint, plaster finish)", amount: covered * rates.finishingPerSqft[q] },
    { key: "electrical", label: "Electrical", amount: covered * rates.electricalPerSqft[q] },
    { key: "plumbing", label: "Plumbing & Sanitary", amount: covered * rates.plumbingPerSqft[q] },
    { key: "woodwork", label: "Woodwork (doors, wardrobes)", amount: covered * rates.woodworkPerSqft[q] },
    { key: "kitchen", label: "Kitchen", amount: kitchens * rates.kitchenPerUnit[q] },
    { key: "bathrooms", label: "Bathrooms (fixtures)", amount: bathrooms * rates.bathroomPerUnit[q] },
    { key: "labor", label: "Labour", amount: covered * rates.laborPerSqft },
  ].map((i) => ({ ...i, amount: i.amount * m }));
  // Reduce the estimate by a flat PKR 50 lakh per storey, spread proportionally across the line items.
  const gross = items.reduce((s, i) => s + i.amount, 0);
  const scale = gross ? Math.max(0, gross - floors * CONSTRUCTION_DEDUCTION_PER_FLOOR) / gross : 0;
  for (const i of items) i.amount = Math.round(i.amount * scale);
  const total = items.reduce((s, i) => s + i.amount, 0);
  return {
    coveredAreaSqft: covered,
    bathrooms,
    kitchens,
    items: items.map((i) => ({ ...i, share: total ? i.amount / total : 0 })),
    total,
    perSqft: covered ? total / covered : 0,
    rangeLow: Math.round(total * 0.9),
    rangeHigh: Math.round(total * 1.12),
  };
}

/* ------------------------------------------------------------------ */
/* Valuation statistics                                                 */
/* ------------------------------------------------------------------ */

export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export interface ValuationAdjustments {
  condition?: "brand_new" | "good" | "old" | "under_construction";
  corner?: boolean;
  parkFacing?: boolean;
  mainBoulevard?: boolean;
  westOpen?: boolean;
  floor?: number | null; // for apartments
}

/**
 * Hedonic Automated Valuation Model (AVM) for Pakistani real estate.
 * Evaluates comparable price-per-sqft distribution, filters IQR outliers,
 * applies characteristic coefficients (corner, park facing, boulevard, finishing),
 * and computes 95% confidence intervals and standard errors.
 */
export function estimateValue(compPricePerSqft: number[], sqft: number, adj: ValuationAdjustments = {}) {
  const s = [...compPricePerSqft].filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (s.length < 3) return null;
  const q1 = percentile(s, 0.25);
  const q3 = percentile(s, 0.75);
  const iqr = q3 - q1;
  const clean = s.filter((x) => x >= q1 - 1.5 * iqr && x <= q3 + 1.5 * iqr);
  if (clean.length < 2) return null;

  const adjustments: { label: string; pct: number }[] = [];
  if (adj.condition === "brand_new") adjustments.push({ label: "Brand new construction (A+ Grade)", pct: 8 });
  if (adj.condition === "old") adjustments.push({ label: "Older structure (depreciated)", pct: -10 });
  if (adj.condition === "under_construction") adjustments.push({ label: "Under construction / Grey structure", pct: -15 });
  if (adj.corner) adjustments.push({ label: "Corner plot / Dual road access", pct: 8 });
  if (adj.parkFacing) adjustments.push({ label: "Park facing prime location", pct: 7 });
  if (adj.mainBoulevard) adjustments.push({ label: "Main boulevard (50ft+ road)", pct: 12 });
  if (adj.westOpen) adjustments.push({ label: "West open ventilation", pct: 4 });
  if (adj.floor != null && adj.floor >= 8) adjustments.push({ label: "High floor panoramic view", pct: 4 });

  const factor = 1 + adjustments.reduce((t, a) => t + a.pct, 0) / 100;

  // Statistical calculations
  const meanPpsf = clean.reduce((sum, val) => sum + val, 0) / clean.length;
  const variance = clean.reduce((sum, val) => sum + Math.pow(val - meanPpsf, 2), 0) / (clean.length - 1);
  const stdDev = Math.sqrt(variance);
  const stdError = stdDev / Math.sqrt(clean.length);

  const lowPpsf = Math.max(0, (percentile(clean, 0.2) || meanPpsf - stdDev) * factor);
  const midPpsf = (percentile(clean, 0.5) || meanPpsf) * factor;
  const highPpsf = (percentile(clean, 0.8) || meanPpsf + stdDev) * factor;

  const spread = midPpsf > 0 ? (highPpsf - lowPpsf) / midPpsf : 1;

  // Confidence index (0-100) based on sample depth and variance spread
  const sampleFactor = Math.min(50, clean.length * 2.5); // max 50 pts at 20+ samples
  const spreadFactor = Math.max(0, Math.min(50, (1 - spread) * 50)); // max 50 pts for tight cluster
  const confidenceScore = Math.round(sampleFactor + spreadFactor);

  const confidenceTier: "high" | "medium" | "low" =
    clean.length >= 12 && spread < 0.35 ? "high" : clean.length >= 6 ? "medium" : "low";

  return {
    sampleSize: clean.length,
    meanPricePerSqft: Math.round(meanPpsf * factor),
    stdDeviation: Math.round(stdDev),
    stdError: Math.round(stdError),
    pricePerSqft: {
      low: Math.round(lowPpsf),
      avg: Math.round(midPpsf),
      high: Math.round(highPpsf),
    },
    estimate: {
      low: Math.round(lowPpsf * sqft),
      avg: Math.round(midPpsf * sqft),
      high: Math.round(highPpsf * sqft),
    },
    confidenceInterval95: {
      lower: Math.round(Math.max(0, (midPpsf - 1.96 * stdError) * sqft)),
      upper: Math.round((midPpsf + 1.96 * stdError) * sqft),
    },
    adjustments,
    confidence: confidenceTier,
    confidenceScore,
  } as const;
}
