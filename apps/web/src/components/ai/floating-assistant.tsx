"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, Expand, Loader2, MapPin, RotateCcw, Sparkles, X } from "lucide-react";
import { formatArea, formatPKR, isUAE } from "@propertyx/shared";
import { api } from "@/lib/client";
import { useT } from "../i18n";

type Ranked = { listing: { id: string; slug: string; title: string; price: number; purpose: string; coverUrl: string | null; locationFullName: string | null; areaValue: number; areaUnit: "marla" }; score: number };
type Resp = { reply: string; criteria: Record<string, unknown>; total: number; results: Ranked[]; followUps: string[]; searchUrl: string; sessionId?: string };
type Msg = { role: "user"; text: string } | { role: "assistant"; data: Resp };

const STARTERS = isUAE
  ? ["2 bed apartment in Dubai Marina under AED 2M", "Villa for rent in Dubai Hills", "Off-plan apartment in Business Bay"]
  : ["10 marla house in Lahore under 5 crore", "2 bed flat for rent in Islamabad", "Plots on installments in Multan"];

/** Compact floating version of the AI assistant (same API as /ai). */
export function FloatingAssistant() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [criteria, setCriteria] = useState<Record<string, unknown>>({});
  const [lastPrices, setLastPrices] = useState<number[]>([]);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const end = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // braces matter: newer browsers return a Promise from scrollIntoView, which React would treat as a cleanup function
    end.current?.scrollIntoView({ block: "end" });
  }, [msgs, busy, open]);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Listen for WhatsApp open event to cleanly close AI assistant
  useEffect(() => {
    const handleClose = () => setOpen(false);
    window.addEventListener("px:close-ai-assistant", handleClose);
    return () => window.removeEventListener("px:close-ai-assistant", handleClose);
  }, []);

  const toggleOpen = () => {
    setOpen((prev) => {
      const next = !prev;
      if (next) {
        window.dispatchEvent(new CustomEvent("px:close-whatsapp"));
      }
      return next;
    });
  };

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setMsgs((m) => [...m, { role: "user", text: t }]);
    setInput("");
    setBusy(true);
    try {
      const r = await api<Resp>("/api/v1/ai/assistant", { body: { message: t, criteria, lastResultPrices: lastPrices, sessionId } });
      setCriteria(r.criteria);
      setLastPrices(r.results.map((x) => x.listing.price));
      setSessionId(r.sessionId);
      setMsgs((m) => [...m, { role: "assistant", data: r }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", data: { reply: (e as Error).message || "Something went wrong. Please try again.", criteria, total: 0, results: [], followUps: [], searchUrl: "/search" } }]);
    } finally {
      setBusy(false);
    }
  };

  const restart = () => {
    setMsgs([]);
    setCriteria({});
    setLastPrices([]);
    setSessionId(undefined);
  };
  const lastUser = [...msgs].reverse().find((m) => m.role === "user") as { text: string } | undefined;
  const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant") as { data: Resp } | undefined;

  return (
    <>
      {open && (
        <div role="dialog" aria-label="AI property assistant" className="fixed inset-x-2 bottom-4 top-20 z-50 flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl md:inset-x-auto md:bottom-[5.5rem] md:end-6 md:top-auto md:h-[min(600px,calc(100dvh-8rem))] md:w-[400px] transform-gpu will-change-transform">
          <div className="flex items-center gap-3 bg-gradient-to-br from-brand-700 to-brand-900 px-4 py-3 text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
              <Sparkles className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-bold leading-tight text-white">{t("AI Property Assistant")}</p>
              <p className="text-xs text-brand-100/80">{t("Searches live listings only")}</p>
            </div>
            {msgs.length > 0 && (
              <button onClick={restart} className="rounded-lg p-1.5 hover:bg-white/15" aria-label={t("Start over")} title={t("Start over")}>
                <RotateCcw className="h-4 w-4" />
              </button>
            )}
            <Link href={lastUser ? `/ai?q=${encodeURIComponent(lastUser.text)}` : "/ai"} className="rounded-lg p-1.5 hover:bg-white/15" aria-label={t("Open full assistant")} title={t("Open full assistant")}>
              <Expand className="h-4 w-4" />
            </Link>
            <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 hover:bg-white/15" aria-label={t("Close assistant")}>
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
            <div className="max-w-[90%] rounded-2xl rounded-ss-md bg-white px-3.5 py-2.5 text-sm text-slate-800 shadow-sm">
              {isUAE
                ? t("Hello! Tell me what you're looking for — budget in AED, size in sq ft, emirate or community — and I'll find matching listings.")
                : t("Assalam o Alaikum! Tell me what you're looking for — budget in lakh or crore, size in marla, city or area — and I'll find matching listings.")}
            </div>
            {msgs.length === 0 && (
              <div className="flex flex-col items-start gap-2">
                {STARTERS.map((s) => (
                  <button key={s} onClick={() => send(s)} className="rounded-full border border-brand-200 bg-white px-3 py-1.5 text-start text-xs font-medium text-brand-800 hover:bg-brand-50">
                    {t(s)}
                  </button>
                ))}
              </div>
            )}
            {msgs.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-ee-md bg-brand-700 px-3.5 py-2 text-sm text-white">{m.text}</p>
                </div>
              ) : (
                <div key={i} className="space-y-2">
                  <p className="max-w-[95%] rounded-2xl rounded-ss-md bg-white px-3.5 py-2.5 text-sm leading-relaxed text-slate-800 shadow-sm">{m.data.reply}</p>
                  {m.data.results.slice(0, 3).map((r) => (
                    <Link key={r.listing.id} href={`/property/${r.listing.slug}`} className="flex gap-2.5 rounded-xl border border-slate-200 bg-white p-2 hover:border-brand-300">
                      {r.listing.coverUrl && <img src={r.listing.coverUrl.replace(/w=\d+/, "w=200")} alt="" className="h-16 w-20 shrink-0 rounded-lg object-cover" loading="lazy" />}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-bold text-slate-900">
                            {formatPKR(r.listing.price)}
                            {r.listing.purpose === "rent" ? (isUAE ? "/yr" : "/mo") : ""}
                          </span>
                          <span className="shrink-0 text-[11px] font-semibold text-brand-700">{t("{n}% match", { n: r.score })}</span>
                        </span>
                        <span className="block truncate text-xs text-slate-700">{r.listing.title}</span>
                        <span className="flex items-center gap-1 truncate text-[11px] text-slate-500">
                          <MapPin className="h-3 w-3 shrink-0" /> {r.listing.locationFullName} · {formatArea(r.listing.areaValue, r.listing.areaUnit)}
                        </span>
                      </span>
                    </Link>
                  ))}
                  {m.data.total > 3 && (
                    <Link href={m.data.searchUrl} className="inline-block text-xs font-semibold text-brand-700 hover:text-brand-800">
                      {t("See all {n} results →", { n: m.data.total })}
                    </Link>
                  )}
                </div>
              ),
            )}
            {busy && (
              <p className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> {t("Searching listings…")}
              </p>
            )}
            {!busy && lastAssistant && lastAssistant.data.followUps.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {lastAssistant.data.followUps.slice(0, 3).map((f) => (
                  <button key={f} onClick={() => send(f)} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:border-brand-300">
                    {f}
                  </button>
                ))}
              </div>
            )}
            <div ref={end} />
          </div>

          <form
            className="flex gap-2 border-t border-slate-200 bg-white p-3"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} placeholder={t("e.g. Show cheaper options")} className="input py-2.5" maxLength={500} aria-label={t("Message the assistant")} />
            <button className="btn-primary shrink-0 px-3" disabled={busy || !input.trim()} aria-label={t("Send")}>
              <ArrowUp className="h-5 w-5" />
            </button>
          </form>
        </div>
      )}

      <button
        onClick={toggleOpen}
        className={`fixed bottom-[4.75rem] end-4 z-40 items-center gap-2 ${open ? "hidden md:flex" : "flex"} rounded-full bg-brand-800 hover:bg-brand-900 py-2.5 px-3.5 sm:py-3 sm:px-4 font-semibold text-white shadow-xl ring-4 ring-white transition-all transform hover:scale-105 active:scale-95 md:bottom-[5.5rem] md:end-6 transform-gpu will-change-transform`}
        aria-label={t(open ? "Close AI assistant" : "Open AI assistant")}
        aria-expanded={open}
        title={t("Ask AI")}
      >
        {open ? <X className="h-5 w-5" /> : <Sparkles className="h-5 w-5 text-gold-300" />}
        <span className="text-xs sm:text-sm">{t(open ? "Close" : "Ask AI")}</span>
      </button>
    </>
  );
}
