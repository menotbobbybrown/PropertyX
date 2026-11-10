"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Phone, MessageCircle, MessageSquare, CalendarDays, HandCoins, Share2, Flag, Loader2, Info, ShieldCheck } from "lucide-react";
import { REPORT_REASONS, formatPKR, COUNTRY } from "@propertyx/shared";
import { api, ApiError, anonId, fieldError } from "@/lib/client";
import { Modal, FieldError, FormError } from "../modal";
import { SaveButton } from "../save-button";
import { toast } from "../toast";

export interface ContactProps {
  listingId: string;
  slug: string;
  title: string;
  price: number;
  purpose: "sale" | "rent";
  contactName: string;
  contactPhone: string;
  contactWhatsapp: string | null;
  isSeed: boolean;
  isOwner: boolean;
  active: boolean;
  saved: boolean;
  user: { name: string; email: string; phone: string | null } | null;
}

const track = (listingId: string, type: string) => fetch(`/api/v1/listings/${listingId}/events`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type, anonId: anonId() }), keepalive: true }).catch(() => {});

export function ContactPanel(p: ContactProps) {
  const router = useRouter();
  const [showPhone, setShowPhone] = useState(false);
  const [modal, setModal] = useState<null | "visit" | "offer" | "enquiry" | "report" | "escrow">(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const loginFirst = () => router.push(`/login?next=${encodeURIComponent(`/property/${p.slug}`)}`);
  const contactsDisabled = p.isSeed;
  const waNumber = (p.contactWhatsapp ?? p.contactPhone).replace(/\D/g, "");
  const shareUrl = typeof window !== "undefined" ? window.location.href : "";

  const submit = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      toast(ok);
      setModal(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) loginFirst();
      setErr(e);
    } finally {
      setBusy(false);
    }
  };

  const [text, setText] = useState(`Hi, I'm interested in “${p.title}”. Is it still available?`);
  const message = async () => {
    if (!p.user) return loginFirst();
    if (!text.trim()) return toast("Write a message first", "error");
    setBusy(true);
    try {
      const r = await api<{ id: string }>("/api/v1/conversations", { body: { listingId: p.listingId, message: text.trim() } });
      track(p.listingId, "message");
      router.push(`/messages/${r.id}`);
    } catch (e) {
      toast((e as Error).message, "error");
      setBusy(false);
    }
  };

  const share = async () => {
    track(p.listingId, "share");
    if (navigator.share) {
      try {
        await navigator.share({ title: p.title, url: shareUrl });
      } catch {
        /* dismissed */
      }
    } else {
      await navigator.clipboard.writeText(shareUrl);
      toast("Link copied");
    }
  };

  if (p.isOwner)
    return (
      <div className="space-y-2">
        <a href={`/dashboard/listings/${p.listingId}/edit`} className="btn-primary w-full">
          Edit listing
        </a>
        <a href={`/dashboard/listings/${p.listingId}`} className="btn-outline w-full">
          View analytics & leads
        </a>
      </div>
    );

  return (
    <div className="space-y-2.5">
      {!p.active && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">This listing is no longer active.</p>}
      {contactsDisabled && (
        <p className="flex gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <Info className="mt-0.5 h-4 w-4 shrink-0" /> Demo listing — phone and WhatsApp are disabled. Use in-app messaging or the forms below to test the flow.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {showPhone && !contactsDisabled ? (
          <a href={`tel:${p.contactPhone}`} className="btn-primary" onClick={() => track(p.listingId, "call_click")}>
            <Phone className="h-4 w-4" /> {p.contactPhone.replace(COUNTRY.phone.dial, "0")}
          </a>
        ) : (
          <button
            className="btn-primary"
            disabled={contactsDisabled || !p.active}
            onClick={() => {
              setShowPhone(true);
              track(p.listingId, "phone_reveal");
            }}
          >
            <Phone className="h-4 w-4" /> Call
          </button>
        )}
        <a
          href={
            contactsDisabled || !p.active
              ? undefined
              : `https://wa.me/${waNumber}?text=${encodeURIComponent(
                  `Assalam-o-Alaikum ${p.contactName ? p.contactName.split(" ")[0] : ""}, I saw your listing "${p.title}" on PropertyX (Price: ${formatPKR(p.price)}). Is this still available? Ref: /property/${p.slug}`
                )}`
          }
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={contactsDisabled}
          onClick={() => !contactsDisabled && track(p.listingId, "whatsapp_click")}
          className={`btn bg-[#25D366] text-white hover:bg-[#1ebe5b] ${contactsDisabled || !p.active ? "pointer-events-none opacity-50" : ""}`}
        >
          <MessageCircle className="h-4 w-4" /> WhatsApp
        </a>
      </div>
      <form
        className="rounded-xl border border-slate-200 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          message();
        }}
      >
        <label className="label" htmlFor="cp-msg">Message {p.contactName.split(" ")[0]}</label>
        <textarea id="cp-msg" className="input min-h-24 resize-y" value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} disabled={!p.active} />
        <button type="submit" className="btn-outline mt-2 w-full" disabled={busy || !p.active || !text.trim()}>
          {busy && !modal ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />} {p.user ? "Send message" : "Log in to send"}
        </button>
      </form>
      <div className="grid grid-cols-2 gap-2">
        <button className="btn-outline" disabled={!p.active} onClick={() => (p.user ? setModal("visit") : loginFirst())}>
          <CalendarDays className="h-4 w-4" /> Request Visit
        </button>
        <button className="btn-outline" disabled={!p.active} onClick={() => setModal("offer")}>
          <HandCoins className="h-4 w-4" /> Make Offer
        </button>
      </div>
      {p.purpose === "sale" && (
        <button
          className="btn w-full bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm flex items-center justify-center gap-2 py-2.5"
          disabled={!p.active}
          onClick={() => (p.user ? setModal("escrow") : loginFirst())}
        >
          <ShieldCheck className="h-4 w-4" /> Reserve Property (Escrow Token)
        </button>
      )}
      <button className="btn-ghost w-full text-brand-700" disabled={!p.active} onClick={() => setModal("enquiry")}>
        <CalendarDays className="h-4 w-4" /> Schedule a viewing call-back
      </button>
      <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
        <SaveButton listingId={p.listingId} initial={p.saved} variant="button" />
        <button className="btn-outline flex-1" onClick={share}>
          <Share2 className="h-4 w-4" /> Share
        </button>
        <button className="btn-ghost px-3 text-slate-500" onClick={() => setModal("report")} title="Report listing" aria-label="Report listing">
          <Flag className="h-4 w-4" />
        </button>
      </div>

      <VisitModal open={modal === "visit"} onClose={() => setModal(null)} busy={busy} err={err} phone={p.user?.phone ?? ""} onSubmit={(v) => submit(() => api("/api/v1/appointments", { body: { ...v, listingId: p.listingId } }), "Visit requested. You'll be notified when it's confirmed.")} />
      <LeadModal
        mode={modal === "offer" ? "offer" : "enquiry"}
        open={modal === "offer" || modal === "enquiry"}
        onClose={() => setModal(null)}
        busy={busy}
        err={err}
        user={p.user}
        price={p.price}
        purpose={p.purpose}
        onSubmit={(v) => submit(() => api("/api/v1/leads", { body: { ...v, listingId: p.listingId } }), modal === "offer" ? "Offer sent to the seller" : "Request sent. The seller will call you back.")}
      />
      <ReportModal open={modal === "report"} onClose={() => setModal(null)} busy={busy} err={err} onSubmit={(v) => submit(() => api("/api/v1/reports", { body: { ...v, targetType: "listing", targetId: p.listingId } }), "Thanks — our Trust & Safety team will review this.")} />
      <EscrowModal open={modal === "escrow"} onClose={() => setModal(null)} listingId={p.listingId} title={p.title} price={p.price} />
    </div>
  );
}

function VisitModal({ open, onClose, onSubmit, busy, err, phone: initialPhone }: { open: boolean; onClose: () => void; onSubmit: (v: Record<string, unknown>) => void; busy: boolean; err: unknown; phone: string }) {
  const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
  const [date, setDate] = useState(tomorrow);
  const [time, setTime] = useState("16:00");
  const [visitors, setVisitors] = useState(1);
  const [phone, setPhone] = useState(initialPhone);
  const [message, setMessage] = useState("");
  return (
    <Modal open={open} onClose={onClose} title="Request a visit">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ date, time, visitors, phone, message });
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="v-date">Date</label>
            <input id="v-date" type="date" className="input" min={tomorrow} value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="v-time">Time</label>
            <select id="v-time" className="input" value={time} onChange={(e) => setTime(e.target.value)}>
              {Array.from({ length: 23 }, (_, i) => `${String(9 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="v-n">Visitors</label>
            <input id="v-n" type="number" min={1} max={10} className="input" value={visitors} onChange={(e) => setVisitors(Number(e.target.value))} />
          </div>
          <div>
            <label className="label" htmlFor="v-phone">Your phone</label>
            <input id="v-phone" className="input" placeholder={COUNTRY.phone.example} value={phone} onChange={(e) => setPhone(e.target.value)} required />
            <FieldError msg={fieldError(err, "phone")} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="v-msg">Message (optional)</label>
          <textarea id="v-msg" className="input min-h-20" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} />
        </div>
        <FormError msg={err instanceof Error ? err.message : null} />
        <button className="btn-primary w-full" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Send request
        </button>
      </form>
    </Modal>
  );
}

function LeadModal({ mode, open, onClose, onSubmit, busy, err, user, price, purpose }: { mode: "offer" | "enquiry"; open: boolean; onClose: () => void; onSubmit: (v: Record<string, unknown>) => void; busy: boolean; err: unknown; user: ContactProps["user"]; price: number; purpose: string }) {
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone?.replace(COUNTRY.phone.dial, "0") ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [offer, setOffer] = useState(String(Math.round((price * 0.95) / 100_000) * 100_000));
  const [message, setMessage] = useState(mode === "offer" ? "" : "Please call me back to arrange a viewing.");
  return (
    <Modal open={open} onClose={onClose} title={mode === "offer" ? "Make an offer" : "Request a call-back"}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ name, phone, email, message, source: mode === "offer" ? "offer" : "form", offerAmount: mode === "offer" ? Number(offer) : undefined });
        }}
      >
        {mode === "offer" && (
          <div>
            <label className="label" htmlFor="o-amt">Your offer ({COUNTRY.currency}){purpose === "rent" ? " per month" : ""}</label>
            <input id="o-amt" inputMode="numeric" className="input text-lg font-semibold" value={offer} onChange={(e) => setOffer(e.target.value.replace(/\D/g, ""))} required />
            <p className="mt-1 text-xs text-slate-500">
              {Number(offer) > 0 && `${formatPKR(Number(offer))} — ${Math.round((Number(offer) / price) * 100)}% of the asking price (${formatPKR(price)})`}
            </p>
          </div>
        )}
        <div>
          <label className="label" htmlFor="l-name">Name</label>
          <input id="l-name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          <FieldError msg={fieldError(err, "name")} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="l-phone">Phone</label>
            <input id="l-phone" className="input" placeholder={COUNTRY.phone.example} value={phone} onChange={(e) => setPhone(e.target.value)} required />
            <FieldError msg={fieldError(err, "phone")} />
          </div>
          <div>
            <label className="label" htmlFor="l-email">Email</label>
            <input id="l-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="l-msg">Message</label>
          <textarea id="l-msg" className="input min-h-20" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} />
        </div>
        <FormError msg={err instanceof Error ? err.message : null} />
        <button className="btn-primary w-full" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} {mode === "offer" ? "Send offer" : "Send request"}
        </button>
        <p className="text-center text-[11px] text-slate-400">Your details are shared only with the advertiser of this property.</p>
      </form>
    </Modal>
  );
}

export function ReportModal({ open, onClose, onSubmit, busy, err }: { open: boolean; onClose: () => void; onSubmit: (v: Record<string, unknown>) => void; busy: boolean; err: unknown }) {
  const [reason, setReason] = useState("fraud");
  const [details, setDetails] = useState("");
  return (
    <Modal open={open} onClose={onClose} title="Report this listing">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ reason, details });
        }}
      >
        <div className="space-y-2">
          {REPORT_REASONS.map((r) => (
            <label key={r.key} className="flex items-center gap-2 text-sm">
              <input type="radio" name="reason" value={r.key} checked={reason === r.key} onChange={() => setReason(r.key)} className="accent-brand-700" /> {r.label}
            </label>
          ))}
        </div>
        <textarea className="input min-h-24" placeholder="Tell us what happened (optional)" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={2000} />
        <FormError msg={err instanceof Error ? err.message : null} />
        <button className="btn-danger w-full" disabled={busy}>
          Submit report
        </button>
      </form>
    </Modal>
  );
}

function EscrowModal({
  open,
  onClose,
  listingId,
  title,
  price,
}: {
  open: boolean;
  onClose: () => void;
  listingId: string;
  title: string;
  price: number;
}) {
  const [gateway, setGateway] = useState("sandbox");
  const [amount, setAmount] = useState(50000);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const startEscrow = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await api<{
        action: { type: string; url: string; fields?: Record<string, string> };
      }>("/api/v1/payments/checkout", {
        body: {
          purpose: "token_deposit",
          referenceId: listingId,
          gateway,
          amount,
        },
      });

      if (res.action.type === "redirect") {
        window.location.href = res.action.url;
      } else if (res.action.type === "form_post") {
        const form = document.createElement("form");
        form.method = "POST";
        form.action = res.action.url;
        for (const [k, v] of Object.entries(res.action.fields || {})) {
          const inp = document.createElement("input");
          inp.type = "hidden";
          inp.name = k;
          inp.value = v;
          form.appendChild(inp);
        }
        document.body.appendChild(form);
        form.submit();
      }
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Reserve with Escrow Token (Digital Bayana)">
      <div className="space-y-4 text-sm text-slate-700">
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3.5 text-xs text-emerald-900 space-y-1.5">
          <p className="font-bold flex items-center gap-1.5 text-emerald-800">
            <ShieldCheck className="h-4 w-4" /> 100% Escrow Guarantee
          </p>
          <p>
            Your deposit is held securely in PropertyX escrow. The property is placed on an exclusive <strong>7-day reserve hold</strong> while title deeds and legal allotment documents are verified.
          </p>
          <p className="text-emerald-700 font-medium">
            Full instant refund if the property documents show any legal defects, stay orders, or title mismatch.
          </p>
        </div>

        <div>
          <label className="label">Token Deposit Amount (PKR)</label>
          <select
            className="input font-semibold"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
          >
            <option value={25000}>PKR 25,000 (Initial Token)</option>
            <option value={50000}>PKR 50,000 (Standard 7-Day Hold)</option>
            <option value={100000}>PKR 100,000 (Firm Bayana Hold)</option>
          </select>
          <p className="mt-1 text-xs text-slate-500">{title} — Asking: {formatPKR(price)}</p>
        </div>

        <div>
          <label className="label">Payment Method</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: "jazzcash", name: "JazzCash" },
              { id: "easypaisa", name: "Easypaisa" },
              { id: "sandbox", name: "Test Wallet" },
            ].map((gw) => (
              <button
                key={gw.id}
                type="button"
                onClick={() => setGateway(gw.id)}
                className={`rounded-xl border p-2.5 text-xs font-semibold text-center transition-all ${
                  gateway === gw.id
                    ? "border-emerald-600 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-600"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {gw.name}
              </button>
            ))}
          </div>
        </div>

        {err && <p className="text-xs text-red-600 font-medium">{err}</p>}

        <button
          onClick={startEscrow}
          disabled={busy}
          className="btn bg-emerald-600 hover:bg-emerald-700 text-white w-full py-3 flex items-center justify-center gap-2 font-semibold"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          Proceed to Pay {formatPKR(amount)}
        </button>
      </div>
    </Modal>
  );
}
