import { startCheckout } from "@propertyx/core";
import type { PaymentPurpose } from "@propertyx/shared";
import { route, body } from "@/lib/api";
import { db, appUrl } from "@/lib/server";

export const POST = route(async ({ req, user }) => {
  const b = await body<{ purpose: PaymentPurpose; referenceId: string; gateway: string; option?: string; amount?: number }>(req);
  const { payment, action } = await startCheckout(db, user, b, appUrl());
  return { invoiceNumber: payment.invoiceNumber, amount: payment.amount, action };
}, { auth: true, rate: 20 });
