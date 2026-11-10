import { pitchPropertyRequirement, listRequirementPitches } from "@propertyx/core";
import { route, body } from "@/lib/api";
import { db } from "@/lib/server";

export const GET = route(async ({ params }) => {
  return { items: await listRequirementPitches(db, params.id) };
});

export const POST = route(
  async ({ user, params, req }) => {
    return pitchPropertyRequirement(db, user!, params.id, await body(req));
  },
  { auth: true, rate: 20 },
);
