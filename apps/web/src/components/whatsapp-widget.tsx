"use client";

import { useState } from "react";
import { MessageCircle, X, Send } from "lucide-react";
import { usePathname } from "next/navigation";

interface WhatsAppWidgetProps {
  platformPhone?: string; // e.g. "923001234567"
}

export function WhatsAppWidget({ platformPhone = "923000000000" }: WhatsAppWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [customMsg, setCustomMsg] = useState("");
  const pathname = usePathname();

  // Don't show on admin or login/register pages
  if (pathname?.startsWith("/admin") || pathname?.startsWith("/login") || pathname?.startsWith("/register")) {
    return null;
  }

  const cleanPhone = platformPhone.replace(/\D/g, "");

  const getQuickMessage = (type: string) => {
    switch (type) {
      case "buy":
        return "Assalam-o-Alaikum, I am looking to buy a property and need assistance with verified listings.";
      case "sell":
        return "Assalam-o-Alaikum, I want to list/sell my property on PropertyX and get it verified.";
      case "valuation":
        return "Assalam-o-Alaikum, I would like to get an automated valuation / market rate estimation for my property.";
      default:
        return "Assalam-o-Alaikum PropertyX Team, I need help with a property.";
    }
  };

  const openWhatsApp = (text: string) => {
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setIsOpen(false);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {isOpen && (
        <div className="mb-3 w-80 rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 transition-all animate-in fade-in slide-in-from-bottom-5">
          {/* Header */}
          <div className="flex items-center justify-between rounded-t-2xl bg-[#075E54] px-4 py-3.5 text-white">
            <div className="flex items-center gap-2.5">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-[#25D366] text-white font-bold text-sm shadow">
                PX
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-green-400"></span>
              </div>
              <div>
                <p className="text-sm font-semibold leading-tight">PropertyX Support</p>
                <p className="text-xs text-green-100">Typically replies in 5 minutes</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-lg p-1 text-green-100 hover:bg-white/10 hover:text-white"
              aria-label="Close WhatsApp chat"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-4 space-y-3 bg-[#E5DDD5]/30">
            <div className="rounded-xl bg-white p-3 text-xs text-slate-700 shadow-sm border border-slate-100">
              <p className="font-semibold text-slate-800 mb-1">Assalam-o-Alaikum! 👋</p>
              <p>How can our verified property specialists help you today?</p>
            </div>

            {/* Quick Action Chips */}
            <div className="space-y-1.5 pt-1">
              <button
                onClick={() => openWhatsApp(getQuickMessage("buy"))}
                className="w-full text-left rounded-lg bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 border border-slate-200 transition-colors shadow-2xs"
              >
                🔍 Looking to Buy Property
              </button>
              <button
                onClick={() => openWhatsApp(getQuickMessage("sell"))}
                className="w-full text-left rounded-lg bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 border border-slate-200 transition-colors shadow-2xs"
              >
                🏡 List & Verify My Property
              </button>
              <button
                onClick={() => openWhatsApp(getQuickMessage("valuation"))}
                className="w-full text-left rounded-lg bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 border border-slate-200 transition-colors shadow-2xs"
              >
                📊 Price Check / AVM Valuation
              </button>
            </div>

            {/* Custom Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (customMsg.trim()) openWhatsApp(customMsg.trim());
              }}
              className="mt-2 flex gap-1.5"
            >
              <input
                type="text"
                placeholder="Type your message..."
                value={customMsg}
                onChange={(e) => setCustomMsg(e.target.value)}
                className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-[#25D366] focus:ring-1 focus:ring-[#25D366]"
              />
              <button
                type="submit"
                disabled={!customMsg.trim()}
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#25D366] text-white hover:bg-[#1ebe5b] disabled:opacity-40 transition-colors"
                aria-label="Send WhatsApp message"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="group relative flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-xl hover:bg-[#1ebe5b] transition-all transform hover:scale-105 active:scale-95 focus:outline-none focus:ring-4 focus:ring-green-300"
        aria-label="Open WhatsApp Support"
      >
        <span className="absolute -top-1 -right-1 flex h-4 w-4">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-4 w-4 bg-green-500 border-2 border-white"></span>
        </span>
        <MessageCircle className="h-7 w-7 fill-white/20" />
      </button>
    </div>
  );
}
