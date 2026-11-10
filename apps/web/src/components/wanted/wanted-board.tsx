"use client";

import { useState } from "react";
import {
  Plus,
  Building2,
  ShieldCheck,
  Clock,
  MessageCircle,
  Sparkles,
  Send,
  CheckCircle2,
} from "lucide-react";
import { formatPKR, PROPERTY_TYPE_KEYS, type PropertyType, type Purpose } from "@propertyx/shared";
import { Modal, FormError } from "@/components/modal";
import { api, ApiError } from "@/lib/client";
import { toast } from "@/components/toast";

export interface RequirementItem {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  cityName: string;
  locationName: string;
  propertyType: PropertyType;
  purpose: Purpose;
  minBudget?: number | null;
  maxBudget: number;
  areaValue?: number | string | null;
  areaUnit?: string | null;
  description: string;
  status: string;
  isDirectBuyer: boolean;
  pitchesCount: number;
  createdAt: string | Date;
}

interface Props {
  initialItems: RequirementItem[];
  user: { id: string; name: string; phone: string | null; verificationLevel: number; isAgent?: boolean } | null;
}

const PAKISTAN_CITIES = ["All", "Lahore", "Karachi", "Islamabad", "Rawalpindi", "Faisalabad", "Peshawar", "Multan"];

export function WantedBoard({ initialItems, user }: Props) {
  const [items, setItems] = useState<RequirementItem[]>(initialItems);
  const [cityFilter, setCityFilter] = useState("All");
  const [purposeFilter, setPurposeFilter] = useState<"all" | "sale" | "rent">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const [postOpen, setPostOpen] = useState(false);
  const [pitchTarget, setPitchTarget] = useState<RequirementItem | null>(null);

  // Post form state
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("Lahore");
  const [locationName, setLocationName] = useState("");
  const [propertyType, setPropertyType] = useState<PropertyType>("residential_plot");
  const [purpose, setPurpose] = useState<Purpose>("sale");
  const [maxBudget, setMaxBudget] = useState("");
  const [areaValue, setAreaValue] = useState("");
  const [areaUnit, setAreaUnit] = useState("marla");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formErr, setFormErr] = useState<unknown>(null);

  // Pitch form state
  const [pitchText, setPitchText] = useState("");
  const [offeredPrice, setOfferedPrice] = useState("");
  const [pitching, setPitching] = useState(false);
  const [pitchErr, setPitchErr] = useState<unknown>(null);

  const filtered = items.filter((item) => {
    if (cityFilter !== "All" && item.cityName.toLowerCase() !== cityFilter.toLowerCase()) return false;
    if (purposeFilter !== "all" && item.purpose !== purposeFilter) return false;
    if (typeFilter !== "all" && item.propertyType !== typeFilter) return false;
    return true;
  });

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormErr(null);
    try {
      const res = await api<RequirementItem>("/api/v1/wanted", {
        body: {
          name,
          phone,
          email: email || undefined,
          cityName: city,
          locationName,
          propertyType,
          purpose,
          maxBudget: Number(maxBudget),
          areaValue: areaValue ? Number(areaValue) : undefined,
          areaUnit: areaUnit || undefined,
          description,
        },
      });
      setItems([res, ...items]);
      toast("Your requirement is published! Verified agents will review and pitch.");
      setPostOpen(false);
      setLocationName("");
      setMaxBudget("");
      setAreaValue("");
      setDescription("");
    } catch (err) {
      setFormErr(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePitch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pitchTarget) return;
    setPitching(true);
    setPitchErr(null);
    try {
      await api(`/api/v1/wanted/${pitchTarget.id}/pitch`, {
        body: {
          pitchText,
          offeredPrice: offeredPrice ? Number(offeredPrice) : undefined,
        },
      });
      toast("Pitch submitted! The buyer has been notified.");
      setItems((prev) =>
        prev.map((i) => (i.id === pitchTarget.id ? { ...i, pitchesCount: i.pitchesCount + 1 } : i)),
      );
      setPitchTarget(null);
      setPitchText("");
      setOfferedPrice("");
    } catch (err) {
      setPitchErr(err);
    } finally {
      setPitching(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Competitive value proposition banner */}
      <div className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-brand-50 p-6 md:p-8 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl space-y-2">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
              <Sparkles className="h-3.5 w-3.5" /> Buyer Advantage: 0 Ghost Ads
            </div>
            <h2 className="text-2xl font-black text-slate-900 sm:text-3xl">
              Tell us what you want. Let verified brokers compete for you.
            </h2>
            <p className="text-sm text-slate-600 sm:text-base">
              Tired of calling numbers on old, sold, or fake listings? Post your specific property requirement here.
              Only verified brokers (Association accredited & FBR tax compliant) can pitch matching real estate.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPostOpen(true)}
            className="btn-primary inline-flex shrink-0 items-center justify-center gap-2 px-6 py-3.5 text-base shadow-lg shadow-brand-700/20"
          >
            <Plus className="h-5 w-5" /> Post Your Requirement Free
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 border-t border-emerald-100 pt-6 sm:grid-cols-3 text-xs text-slate-700">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span><strong>Zero Fake Ads:</strong> You set the location, size, and budget.</span>
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
            <span><strong>Verified Agents Only:</strong> No freelance roadside scammers.</span>
          </div>
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-emerald-600 shrink-0" />
            <span><strong>Direct WhatsApp:</strong> Instant pitch replies without middlemen.</span>
          </div>
        </div>
      </div>

      {/* Filter and search controls */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        {/* City pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {PAKISTAN_CITIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCityFilter(c)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                cityFilter === c ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Purpose and Type filters */}
        <div className="flex items-center gap-2">
          <select
            value={purposeFilter}
            onChange={(e) => setPurposeFilter(e.target.value as "all" | "sale" | "rent")}
            className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
          >
            <option value="all">Buy & Rent</option>
            <option value="sale">Buy Only</option>
            <option value="rent">Rent Only</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 capitalize"
          >
            <option value="all">All Types</option>
            {PROPERTY_TYPE_KEYS.map((k) => (
              <option key={k} value={k}>
                {k.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Feed list */}
      <div className="space-y-4">
        <div className="flex items-center justify-between text-sm text-slate-500">
          <p>
            Showing <strong>{filtered.length}</strong> active buyer {filtered.length === 1 ? "requirement" : "requirements"}
          </p>
        </div>

        {filtered.length === 0 ? (
          <div className="card p-12 text-center">
            <Building2 className="mx-auto h-12 w-12 text-slate-300" />
            <h3 className="mt-3 text-lg font-bold text-slate-800">No requirements found</h3>
            <p className="mt-1 text-sm text-slate-500">
              Be the first to post a property requirement for this criteria!
            </p>
            <button
              type="button"
              onClick={() => setPostOpen(true)}
              className="btn-primary mt-4 inline-flex items-center gap-2"
            >
              <Plus className="h-4 w-4" /> Post Requirement
            </button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {filtered.map((req) => {
              const waText = encodeURIComponent(
                `Salam ${req.name}, I saw your requirement on Bismillah Pakistan for "${req.locationName}, ${req.cityName}" (Budget: ${formatPKR(req.maxBudget)}). I have a verified property that matches your criteria.`,
              );
              const waUrl = `https://wa.me/${req.phone.replace(/\D/g, "")}?text=${waText}`;

              return (
                <div
                  key={req.id}
                  className="card flex flex-col justify-between p-5 transition hover:border-brand-300 hover:shadow-md"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded-md bg-brand-50 px-2 py-0.5 text-xs font-bold capitalize text-brand-800">
                            {req.purpose === "sale" ? "Buying" : "Renting"} · {req.propertyType.replace(/_/g, " ")}
                          </span>
                          {req.isDirectBuyer && (
                            <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                              Direct Buyer
                            </span>
                          )}
                        </div>
                        <h3 className="mt-1.5 text-base font-extrabold text-slate-900">
                          {req.areaValue ? `${req.areaValue} ${req.areaUnit ?? "Marla"} in ` : ""}
                          {req.locationName}, {req.cityName}
                        </h3>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-400">Max Budget</p>
                        <p className="text-base font-black text-brand-700">{formatPKR(req.maxBudget)}</p>
                      </div>
                    </div>

                    <p className="text-sm text-slate-600 line-clamp-3 leading-relaxed whitespace-pre-line">
                      {req.description}
                    </p>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                        {new Date(req.createdAt).toLocaleDateString("en-PK", { month: "short", day: "numeric" })}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
                        {req.pitchesCount} {req.pitchesCount === 1 ? "pitch" : "pitches"}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-outline btn-xs flex items-center gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                      >
                        <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                      </a>
                      <button
                        type="button"
                        onClick={() => setPitchTarget(req)}
                        className="btn-primary btn-xs flex items-center gap-1"
                      >
                        <Send className="h-3.5 w-3.5" /> Pitch Property
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Post Requirement Modal */}
      <Modal open={postOpen} onClose={() => setPostOpen(false)} title="Post Property Requirement" wide>
        <form onSubmit={handlePost} className="space-y-4">
          <p className="text-xs text-slate-500">
            Post what you are searching for. Genuine verified real estate agents will contact you directly with matching verified properties.
          </p>

          <FormError msg={formErr instanceof ApiError ? formErr.message : formErr ? "Failed to post requirement" : null} />

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label">Your Name</label>
              <input
                required
                className="input"
                placeholder="e.g. Asad Malik"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Phone (WhatsApp)</label>
              <input
                required
                className="input"
                placeholder="03001234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Email (Optional)</label>
              <input
                type="email"
                className="input"
                placeholder="asad@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label">City</label>
              <select
                className="input"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              >
                {PAKISTAN_CITIES.filter((c) => c !== "All").map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Specific Society / Area / Block</label>
              <input
                required
                className="input"
                placeholder="e.g. DHA Phase 6 Block C or Bahria Phase 7"
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label">Purpose</label>
              <select
                className="input"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value as Purpose)}
              >
                <option value="sale">Buy Property</option>
                <option value="rent">Rent Property</option>
              </select>
            </div>
            <div>
              <label className="label">Property Type</label>
              <select
                className="input capitalize"
                value={propertyType}
                onChange={(e) => setPropertyType(e.target.value as PropertyType)}
              >
                {PROPERTY_TYPE_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {k.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Max Budget (PKR)</label>
              <input
                required
                type="number"
                min="100000"
                className="input"
                placeholder="e.g. 45000000"
                value={maxBudget}
                onChange={(e) => setMaxBudget(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Area / Size (Optional)</label>
              <input
                type="number"
                step="any"
                className="input"
                placeholder="e.g. 10 or 1"
                value={areaValue}
                onChange={(e) => setAreaValue(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Unit</label>
              <select
                className="input"
                value={areaUnit}
                onChange={(e) => setAreaUnit(e.target.value)}
              >
                <option value="marla">Marla</option>
                <option value="kanal">Kanal</option>
                <option value="sqyd">Sq. Yd.</option>
                <option value="sqft">Sq. Ft.</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label">Detailed Criteria</label>
            <textarea
              required
              rows={3}
              className="input"
              placeholder="e.g. Looking for direct owner possession plot. Corner or park facing preferred. Urgent purchase within 2 weeks."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setPostOpen(false)}
              className="btn-outline"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary"
            >
              {submitting ? "Posting..." : "Publish Requirement"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Pitch Modal */}
      <Modal
        open={!!pitchTarget}
        onClose={() => setPitchTarget(null)}
        title={pitchTarget ? `Pitch to ${pitchTarget.name}` : "Pitch Property"}
      >
        {pitchTarget && (
          <form onSubmit={handlePitch} className="space-y-4">
            <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
              <p className="font-semibold">{pitchTarget.locationName}, {pitchTarget.cityName}</p>
              <p className="text-slate-500">
                Budget: {formatPKR(pitchTarget.maxBudget)} · {pitchTarget.propertyType.replace(/_/g, " ")}
              </p>
            </div>

            <FormError
              msg={
                pitchErr instanceof ApiError
                  ? pitchErr.message
                  : pitchErr
                    ? "Failed to send pitch. Verified agent badge required."
                    : null
              }
            />

            <div>
              <label className="label">Your Property Pitch</label>
              <textarea
                required
                rows={4}
                className="input"
                placeholder="Describe the exact property you have that matches this buyer's requirements (e.g. Plot number, block, possession status, features)..."
                value={pitchText}
                onChange={(e) => setPitchText(e.target.value)}
              />
            </div>

            <div>
              <label className="label">Offered Price (PKR, Optional)</label>
              <input
                type="number"
                className="input"
                placeholder={`e.g. ${pitchTarget.maxBudget}`}
                value={offeredPrice}
                onChange={(e) => setOfferedPrice(e.target.value)}
              />
            </div>

            <p className="text-[11px] text-slate-500">
              Note: Only verified agents can submit pitches. Ghost inventory or misleading pitches lead to permanent license suspension.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPitchTarget(null)}
                className="btn-outline"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pitching}
                className="btn-primary"
              >
                {pitching ? "Sending Pitch..." : "Submit Pitch"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
