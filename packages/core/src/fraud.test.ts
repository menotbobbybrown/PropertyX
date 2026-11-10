import { describe, it, expect } from "vitest";
import { scamTextScore, messageSpamScore } from "./fraud";

describe("Fraud & Quality Signals", () => {
  it("detects wallet advance payment scam patterns", () => {
    const text = "Please send advance token via easypaisa or jazzcash account before visit.";
    const result = scamTextScore(text);
    expect(result.score).toBeGreaterThanOrEqual(35);
    expect(result.labels).toContain("asks for advance via wallet/account");
  });

  it("detects overseas owner story and urgency pressure", () => {
    const text = "Owner is abroad in UK. Urgent sale today only, price is final.";
    const result = scamTextScore(text);
    expect(result.score).toBeGreaterThanOrEqual(25);
    expect(result.labels).toContain("owner abroad story");
    expect(result.labels).toContain("urgency pressure");
  });

  it("assigns 0 score to genuine property description", () => {
    const text = "Beautiful 10 marla brand new house for sale in DHA Phase 6 Lahore. 5 master bedrooms, imported fittings, lush green lawn.";
    const result = scamTextScore(text);
    expect(result.score).toBe(0);
    expect(result.labels).toHaveLength(0);
  });

  it("evaluates chat spam score for links and repetitive characters", () => {
    const spamMsg = "CHECK OUT THIS DEAL NOWWWWWWWWWW http://scam-site.com/invest";
    const spam = messageSpamScore(spamMsg, 2);
    expect(spam).toBeGreaterThan(30);

    const cleanMsg = "Assalam-o-Alaikum, is this plot still available for viewing tomorrow?";
    const clean = messageSpamScore(cleanMsg, 0);
    expect(clean).toBeLessThan(15);
  });
});
