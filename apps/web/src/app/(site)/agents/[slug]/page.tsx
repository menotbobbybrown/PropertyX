import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { BadgeCheck, Clock, Languages, MapPin, ShieldCheck, Building2, FileText, Phone } from "lucide-react";
import { getAgentProfile } from "@propertyx/core";
import { agencyPath, areaPath } from "@propertyx/shared";
import { db, getUser } from "@/lib/server";
import { Avatar, Rating } from "@/components/directory/cards";
import { ContactBox } from "@/components/directory/contact-box";
import { LeadRequestBox } from "@/components/directory/lead-request";
import { ReviewsList } from "@/components/directory/reviews";
import { PropertyGrid } from "@/components/property-card";
import { Stat } from "@/components/market/data-note";

type Props = { params: Promise<{ slug: string }> };
const load = cache((slug: string) => getAgentProfile(db, slug));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const d = await load(slug);
  if (!d) return { title: "Agent not found" };
  return { title: `${d.agent.displayName} — property agent${d.agency ? `, ${d.agency.name}` : ""}`, description: d.agent.bio?.slice(0, 160) ?? `Listings and reviews for ${d.agent.displayName}.`, alternates: { canonical: `/agents/${d.agent.slug}` } };
}

export default async function AgentPage({ params }: Props) {
  const { slug } = await params;
  const [d, user] = await Promise.all([load(slug), getUser()]);
  if (!d) notFound();
  const { agent: a, agency, areas, stats, listings } = d;
  const isMe = user?.id === a.userId;

  return (
    <div className="container-px py-10">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <Avatar src={a.photoUrl} name={a.displayName} className="h-24 w-24 text-3xl" />
            <div>
              <h1 className="flex items-center gap-2 text-3xl font-extrabold">
                {a.displayName} {a.verificationLevel >= 2 && <BadgeCheck className="h-6 w-6 text-brand-600" aria-label="Verified agent" />}
              </h1>
              {agency ? (
                <Link href={agencyPath(agency.slug)} className="font-semibold text-brand-700">{agency.name}</Link>
              ) : (
                <p className="text-slate-500">Independent agent</p>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                <Rating rating={a.ratingAvg} reviews={a.reviewsCount} />
                {a.responseTimeMins != null && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Replies in ~{a.responseTimeMins < 60 ? `${a.responseTimeMins} min` : `${Math.round(a.responseTimeMins / 60)} h`}</span>}
                {(a.languages ?? []).length > 0 && <span className="flex items-center gap-1"><Languages className="h-3.5 w-3.5" /> {(a.languages ?? []).join(", ")}</span>}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Active listings" value={String(stats.active)} />
            <Stat label="Sold" value={String(stats.sold)} />
            <Stat label="Rented" value={String(stats.rented)} />
            <Stat label="Experience" value={a.experienceYears != null ? `${a.experienceYears} yrs` : "—"} />
          </div>

          {(a.associationName || a.fbrNtn || a.officeAddress || a.verificationLevel >= 2) && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-700" />
                <h2 className="font-bold text-emerald-950">Verified Professional Credentials</h2>
              </div>
              <p className="mt-1 text-xs text-emerald-800">
                Verified against government & professional association registries to protect property buyers and overseas investors from phantom listings.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 text-xs">
                {a.associationName && (
                  <div className="flex items-start gap-2 rounded-xl bg-white/80 p-2.5 border border-emerald-100">
                    <Building2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-slate-900">{a.associationName}</p>
                      <p className="text-slate-500">Reg #{a.associationNumber || "Active Member"}</p>
                    </div>
                  </div>
                )}
                {a.fbrNtn && (
                  <div className="flex items-start gap-2 rounded-xl bg-white/80 p-2.5 border border-emerald-100">
                    <FileText className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-slate-900">FBR Registered Taxpayer</p>
                      <p className="text-slate-500">NTN: {a.fbrNtn}</p>
                    </div>
                  </div>
                )}
                {a.officeAddress && (
                  <div className="flex items-start gap-2 rounded-xl bg-white/80 p-2.5 border border-emerald-100 sm:col-span-2">
                    <MapPin className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-slate-900">Physical Brokerage Office</p>
                      <p className="text-slate-500">{a.officeAddress}</p>
                    </div>
                  </div>
                )}
                {a.officePhone && (
                  <div className="flex items-start gap-2 rounded-xl bg-white/80 p-2.5 border border-emerald-100">
                    <Phone className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-slate-900">Office Landline</p>
                      <p className="text-slate-500">{a.officePhone}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {a.bio && (
            <section>
              <h2 className="text-xl font-bold">About</h2>
              <p className="mt-2 whitespace-pre-line text-slate-700">{a.bio}</p>
            </section>
          )}

          {((a.specializations ?? []).length > 0 || areas.length > 0) && (
            <section className="grid gap-6 sm:grid-cols-2">
              {(a.specializations ?? []).length > 0 && (
                <div>
                  <h2 className="font-bold">Specialises in</h2>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(a.specializations ?? []).map((s) => (
                      <span key={s} className="badge bg-slate-100 capitalize text-slate-700">{s.replace(/_/g, " ")}</span>
                    ))}
                  </div>
                </div>
              )}
              {areas.length > 0 && (
                <div>
                  <h2 className="font-bold">Areas covered</h2>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {areas.map((x) => (
                      <li key={x.slug}><Link href={areaPath(x.slug)} className="badge bg-brand-50 text-brand-800 hover:bg-brand-100"><MapPin className="h-3 w-3" /> {x.name}</Link></li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {listings.length > 0 && (
            <section>
              <h2 className="mb-4 text-xl font-bold">Latest listings</h2>
              <PropertyGrid items={listings} cols={3} />
            </section>
          )}

          <ReviewsList type="agent" id={a.id} />
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="card p-5">
            {isMe ? (
              <Link href="/dashboard/profile" className="btn-primary w-full">Edit your profile</Link>
            ) : (
              <>
                <LeadRequestBox target={{ agentId: a.id }} to={a.displayName.split(" ")[0]} defaultMessage="Hi, I found your profile on Bismillah. I'm looking for a property and would like your help." />
                <p className="my-4 flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" />or send a message<span className="h-px flex-1 bg-slate-200" /></p>
                <ContactBox to={a.displayName.split(" ")[0]} target={{ userId: a.userId }} defaultText="Hi, I found your profile on Bismillah. I'm looking for a property and would like your help." loggedIn={!!user} next={`/agents/${a.slug}`} />
              </>
            )}
          </div>
          <p className="text-xs text-slate-400">Member since {new Date(d.memberSince).toLocaleDateString("en-PK", { month: "long", year: "numeric" })}. Never pay advance money before visiting a property and checking its documents.</p>
        </aside>
      </div>
    </div>
  );
}
