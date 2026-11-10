import { listPropertyRequirements, createPropertyRequirement } from "@propertyx/core";
import { route, body } from "@/lib/api";
import { db } from "@/lib/server";

export const GET = route(async ({ req }) => {
  const sp = req.nextUrl.searchParams;
  const city = sp.get("city") ?? undefined;
  const propertyType = sp.get("type") ?? undefined;
  const purpose = (sp.get("purpose") as "sale" | "rent") ?? undefined;
  const limit = sp.get("limit") ? Number(sp.get("limit")) : undefined;
  const offset = sp.get("offset") ? Number(sp.get("offset")) : undefined;

  return listPropertyRequirements(db, { city, propertyType, purpose, limit, offset });
});

export const POST = route(
  async ({ user, req, ip }) => createPropertyRequirement(db, user, await body(req), { ip }),
  { rate: 10 },
);
