import { describe, it, expect } from "vitest";
import { signSandbox, sandboxGateway, jazzCashGateway, invoiceNumber, getGateway } from "./index";

describe("Payment Gateways & Signatures", () => {
  it("generates well-formed invoice numbers", () => {
    const inv = invoiceNumber();
    expect(inv).toMatch(/^PX-\d{6}-[A-Z0-9]{6}$/);
  });

  it("signs and verifies sandbox callbacks cryptographically", async () => {
    const inv = "PX-202611-TEST01";
    const amount = 50000;
    const sig = signSandbox(inv, amount, "succeeded");

    const validResult = await sandboxGateway.verifyCallback({
      invoiceNumber: inv,
      amount: String(amount),
      status: "succeeded",
      signature: sig,
    });
    expect(validResult.status).toBe("succeeded");
    expect(validResult.providerRef).toContain("SBX-");

    const forgedResult = await sandboxGateway.verifyCallback({
      invoiceNumber: inv,
      amount: String(amount),
      status: "succeeded",
      signature: "forged_signature_12345",
    });
    expect(forgedResult.status).toBe("failed");
    expect(forgedResult.message).toBe("Invalid signature");
  });

  it("checks JazzCash gateway configuration and form post generation", async () => {
    // JazzCash is not configured without env vars
    delete process.env.JAZZCASH_MERCHANT_ID;
    delete process.env.JAZZCASH_PASSWORD;
    delete process.env.JAZZCASH_INTEGRITY_SALT;
    expect(jazzCashGateway.isConfigured()).toBe(false);

    // Provide mock sandbox credentials
    process.env.JAZZCASH_MERCHANT_ID = "MC12345";
    process.env.JAZZCASH_PASSWORD = "Password123";
    process.env.JAZZCASH_INTEGRITY_SALT = "SaltSecret123";
    expect(jazzCashGateway.isConfigured()).toBe(true);

    const checkout = await jazzCashGateway.createCheckout(
      {
        id: "pay_1",
        invoiceNumber: "PX-202611-AB12CD",
        amount: 25000,
        description: "Token Deposit Escrow",
      },
      {
        appUrl: "https://propertyx.pk",
        returnUrl: "https://propertyx.pk/checkout/return",
      }
    );

    expect(checkout.type).toBe("form_post");
    if (checkout.type === "form_post") {
      expect(checkout.fields.pp_MerchantID).toBe("MC12345");
      expect(checkout.fields.pp_Amount).toBe("2500000"); // Paisas (25000 * 100)
      expect(checkout.fields.pp_TxnCurrency).toBe("PKR");
      expect(checkout.fields.pp_SecureHash).toBeDefined();
      expect(checkout.fields.pp_SecureHash.length).toBe(64); // SHA256 hex
    }
  });
});
