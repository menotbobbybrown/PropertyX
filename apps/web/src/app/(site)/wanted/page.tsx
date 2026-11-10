import type { Metadata } from "next";
import { listPropertyRequirements, createPropertyRequirement } from "@propertyx/core";
import { db, getUser } from "@/lib/server";
import { WantedBoard, type RequirementItem } from "@/components/wanted/wanted-board";

export const metadata: Metadata = {
  title: "Buyer Wanted Board — Post & Pitch Property Requirements | Bismillah Pakistan",
  description:
    "Post what property you need and let verified estate agents pitch matching deals. Zero fake ads, direct contact with real buyers.",
  alternates: { canonical: "/wanted" },
};

// Seed sample requirements if database board is empty
async function ensureSeedRequirements() {
  const { total } = await listPropertyRequirements(db, { limit: 1 });
  if (total > 0) return;

  const seeds = [
    {
      name: "Taimur Tariq (Overseas Investor)",
      phone: "03008451122",
      cityName: "Lahore",
      locationName: "DHA Phase 6 Block C or D",
      propertyType: "residential_plot" as const,
      purpose: "sale" as const,
      maxBudget: 48000000,
      areaValue: 1,
      areaUnit: "kanal" as const,
      description: "Direct owner 1 Kanal possession plot needed. Facing 50ft road or corner preferred. Ready for immediate cash transfer at DHA main office.",
    },
    {
      name: "Chaudhry Kamran",
      phone: "03214567890",
      cityName: "Islamabad",
      locationName: "B-17 Multi Gardens Sector B or C",
      propertyType: "house" as const,
      purpose: "sale" as const,
      maxBudget: 32000000,
      areaValue: 10,
      areaUnit: "marla" as const,
      description: "Brand new double unit 10 Marla house required for family residence. Minimum 4 bedrooms with attached baths and double car porch.",
    },
    {
      name: "Zainab Siddiqui",
      phone: "03339876543",
      cityName: "Karachi",
      locationName: "Clifton Block 5 or 8",
      propertyType: "apartment" as const,
      purpose: "sale" as const,
      maxBudget: 65000000,
      areaValue: 2400,
      areaUnit: "sqft" as const,
      description: "Looking for 3 bed drawing dining apartment with dedicated parking and standby generator. Must have clean title deeds and lease papers.",
    },
  ];

  for (const s of seeds) {
    await createPropertyRequirement(db, null, s).catch(() => null);
  }
}

export default async function WantedPage() {
  await ensureSeedRequirements();
  const [{ items }, user] = await Promise.all([
    listPropertyRequirements(db, { limit: 50 }),
    getUser(),
  ]);

  const mapped: RequirementItem[] = items.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    email: r.email,
    cityName: r.cityName,
    locationName: r.locationName,
    propertyType: r.propertyType,
    purpose: r.purpose,
    minBudget: r.minBudget,
    maxBudget: r.maxBudget,
    areaValue: r.areaValue,
    areaUnit: r.areaUnit,
    description: r.description,
    status: r.status,
    isDirectBuyer: r.isDirectBuyer,
    pitchesCount: r.pitchesCount,
    createdAt: r.createdAt.toISOString(),
  }));

  const userProp = user
    ? {
        id: user.id,
        name: user.name,
        phone: user.phone,
        verificationLevel: user.verificationLevel,
        isAgent: user.roles?.includes("agent") || user.roles?.includes("agency"),
      }
    : null;

  return (
    <div className="container-px py-10 space-y-6">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-black text-slate-900 sm:text-4xl">
          Buyer & Investor Wanted Board
        </h1>
        <p className="mt-2 text-slate-600">
          Post your buying or renting criteria. Verified agents with authentic, verified title deeds will pitch matching properties directly to you.
        </p>
      </div>

      <WantedBoard initialItems={mapped} user={userProp} />
    </div>
  );
}
