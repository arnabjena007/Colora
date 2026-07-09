"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, Download, ArrowUpRight, Sparkles, Layers3, PenTool, ShieldCheck, Wand2, FileText, ChevronDown } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export default function Home() {
  const [toastMsg, setToastMsg] = useState("");
  const [showToast, setShowToast] = useState(false);
  const [showCookie, setShowCookie] = useState(true);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);

  const colors = [
    { name: "Lavender", hex: "#E5D4FF", bg: "bg-lavender" },
    { name: "Mint Green", hex: "#CDEAC0", bg: "bg-mint" },
    { name: "Peach", hex: "#FFD8C2", bg: "bg-peach" },
    { name: "Sky Blue", hex: "#D6EFFF", bg: "bg-sky-blue" },
    { name: "Blush Pink", hex: "#F9D5E5", bg: "bg-blush" },
    { name: "Creamy Yellow", hex: "#FFF3B0", bg: "bg-creamy-yellow" },
  ];

  const copyColor = (hex: string) => {
    navigator.clipboard.writeText(hex).then(() => {
      setToastMsg(`Color code ${hex} copied to clipboard!`);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    });
  };

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setInstallPrompt(null);
      setIsStandalone(true);
      setToastMsg("Pastelle installed");
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const installApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === "accepted") {
      setToastMsg("Pastelle installed");
    } else {
      setToastMsg("Install cancelled");
    }
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  return (
    <div className="min-h-screen text-charcoal font-sans selection:bg-sky-blue/30 relative overflow-hidden bg-[#FBFAF8]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(229,212,255,0.40),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.92),rgba(251,250,248,0.96))]" />
      <div className="absolute inset-x-0 top-0 h-[520px] bg-[linear-gradient(180deg,rgba(255,255,255,0.70),rgba(255,255,255,0))]" />

      {/* TRANSPARENT HEADER BAR */}
      <header className="absolute top-0 left-0 right-0 z-50 py-6">
        <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="font-sans font-bold text-2xl text-[#5E5D6A] tracking-tight flex items-center gap-1.5">
              <span className="text-xl text-[#8E8D9B]">✳</span> Pastelle
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-8">
            <a href="#overview" className="text-[#5E5D6A]/70 font-semibold text-sm hover:text-[#5E5D6A] transition-colors">Overview</a>
            <a href="#features" className="text-[#5E5D6A]/70 font-semibold text-sm hover:text-[#5E5D6A] transition-colors">Features</a>
            <a href="#preview" className="text-[#5E5D6A]/70 font-semibold text-sm hover:text-[#5E5D6A] transition-colors">Preview</a>
          </nav>
          <div className="flex items-center gap-3">
            {installPrompt && !isStandalone && (
              <button
                onClick={installApp}
                className="hidden sm:inline-flex items-center gap-2 px-4 py-2.5 bg-white/70 text-[#5E5D6A] hover:bg-white font-bold text-xs rounded-full transition-all shadow-xs border border-[#EDECF4]"
              >
                <Download className="w-3.5 h-3.5" />
                Install App
              </button>
            )}
            <Link href="/editor" className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#E5D4FF] text-[#5E5D6A] hover:bg-[#F9D5E5] font-bold text-xs rounded-full transition-all shadow-xs">
              Launch Editor
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* FULL COVER BACKGROUND PICTURE HERO SECTION */}
      <section id="overview" className="relative w-full min-h-screen flex flex-col justify-center px-6 py-24 overflow-hidden motion-fade-up">

        {/* Full bleed background image using Next/Image for guaranteed full cover */}
        <Image
          src="/assets/hero_bg.png"
          alt="Pastelle watercolor landscape"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center motion-hero-pan"
        />
        {/* Hero Text Content */}
        <div className="relative z-10 max-w-7xl mx-auto w-full">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-white/68 backdrop-blur-md text-[#5E5D6A] border border-white/70 px-4 py-1.5 rounded-full text-xs font-bold tracking-wide mb-6 shadow-sm motion-pulse-soft">
              <Sparkles className="w-3.5 h-3.5" />
              Premium PDF annotations, built to feel calm
            </div>
            <h1 className="text-[#373744] text-5xl md:text-7xl font-bold tracking-tight leading-[0.98] mb-5 drop-shadow-[0_1px_0_rgba(255,255,255,0.55)] mx-auto max-w-5xl">
              A polished editor for marking up PDFs without the clutter
            </h1>
            <p className="text-[#5E5D6A]/82 text-base md:text-lg max-w-2xl mx-auto leading-relaxed font-medium mb-8">
              Pastelle blends a soft premium interface with fast annotation tools, clean page controls, and a workspace that stays out of your way.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link href="/editor" className="inline-flex items-center gap-2 px-7 py-3.5 bg-[#E5D4FF] text-[#5E5D6A] hover:bg-[#F9D5E5] font-bold text-sm rounded-full transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 hover:scale-[1.01] motion-hover-lift">
                Open editor
                <ArrowUpRight className="w-4 h-4" />
              </Link>
              <a href="#features" className="inline-flex items-center gap-2 px-7 py-3.5 bg-white/72 backdrop-blur-md text-[#5E5D6A] hover:bg-white font-bold text-sm rounded-full transition-all shadow-sm border border-white/70 hover:scale-[1.01] motion-hover-lift">
                Explore features
              </a>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="relative z-10 py-20 md:py-24 motion-fade-up motion-delay-1">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-5">
            {[
              { icon: Layers3, title: "Quiet workspace", text: "A restrained layout keeps focus on the page instead of fighting the document." },
              { icon: Wand2, title: "Designed to feel premium", text: "Soft surfaces, careful spacing, and a calmer visual rhythm across the app." },
              { icon: ShieldCheck, title: "Built for real work", text: "Pages, exports, annotations, and install support all stay close at hand." },
            ].map(item => (
              <article key={item.title} className="rounded-[28px] border border-[#ECEAF3] bg-white/75 backdrop-blur-md p-6 shadow-[0_16px_50px_rgba(142,141,155,0.10)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_60px_rgba(142,141,155,0.16)] motion-hover-lift">
                <item.icon className="w-5 h-5 text-[#8E8D9B] mb-4" />
                <h2 className="text-lg font-bold text-[#373744] mb-2">{item.title}</h2>
                <p className="text-sm leading-relaxed text-[#5E5D6A]">{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 pb-8 motion-fade-up motion-delay-2">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-3 gap-5">
            {[
              { title: "Open", text: "Start from a blank page or upload a PDF from your device.", icon: FileText },
              { title: "Mark up", text: "Use highlight, draw, shapes, notes, and hand-drawn text tools.", icon: PenTool },
              { title: "Export", text: "Merge pages, add page numbers, and export a polished PDF.", icon: Download },
            ].map(step => (
              <div key={step.title} className="rounded-[28px] border border-[#ECEAF3] bg-white/78 backdrop-blur-md p-6 shadow-[0_16px_50px_rgba(142,141,155,0.08)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_60px_rgba(142,141,155,0.14)] motion-hover-lift">
                <step.icon className="w-5 h-5 text-[#8E8D9B] mb-4" />
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#8E8D9B] mb-2">{step.title}</div>
                <p className="text-sm leading-relaxed text-[#5E5D6A]">{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="preview" className="relative z-10 pb-20 md:pb-28 motion-fade-up motion-delay-3">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="rounded-[32px] border border-white/70 bg-white/70 backdrop-blur-md p-5 shadow-[0_20px_60px_rgba(142,141,155,0.12)] transition-transform duration-300 hover:-translate-y-1 motion-hover-lift">
              <div className="relative aspect-[16/10] overflow-hidden rounded-[24px] border border-[#EDECF4]">
                <Image src="/assets/hero_bg.png" alt="Pastelle preview" fill sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover object-center" />
              </div>
            </div>
            <div className="rounded-[32px] border border-[#ECEAF3] bg-white/82 backdrop-blur-md p-8 shadow-[0_20px_60px_rgba(142,141,155,0.10)] flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 motion-hover-lift">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#ECEAF3] text-[11px] font-bold uppercase tracking-[0.18em] text-[#8E8D9B] mb-5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Premium details
                </div>
                <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[#373744] mb-4">
                  Everything feels considered, from the hero image to the last button
                </h2>
                <p className="text-[#5E5D6A] leading-relaxed max-w-xl">
                  The page now leans into a luxe editorial style with softer panels, reduced noise, and clearer separation between browsing, previewing, and launching the editor.
                </p>
              </div>
              <div className="mt-8 grid sm:grid-cols-3 gap-3">
                {colors.slice(0, 3).map(color => (
                  <button key={color.name} onClick={() => copyColor(color.hex)} className="rounded-2xl border border-[#ECEAF3] bg-[#FBFAF8] p-4 text-left hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 motion-hover-lift">
                    <div className="w-10 h-10 rounded-full mb-4 shadow-inner" style={{ backgroundColor: color.hex }} />
                    <div className="text-sm font-bold text-[#373744]">{color.name}</div>
                    <div className="text-xs text-[#8E8D9B] mt-1">{color.hex}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="faq" className="relative z-10 pb-20 md:pb-28 motion-fade-up motion-delay-4">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#ECEAF3] bg-white/70 text-[11px] font-bold uppercase tracking-[0.18em] text-[#8E8D9B] mb-4">
              <Sparkles className="w-3.5 h-3.5" />
              FAQ
            </div>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[#373744]">A few quick answers</h2>
          </div>
          <div className="space-y-3">
            {[
              { q: "Can I start with a blank page?", a: "Yes. You can launch the editor blank and add pages later with the plus button." },
              { q: "Does it export PDF or PNG?", a: "It exports a PDF so your annotations stay in the same document format." },
              { q: "Is there a desktop-style install?", a: "Yes. The app supports install as a PWA so it can open like a local app window." },
            ].map(item => (
              <details key={item.q} className="group rounded-[24px] border border-[#ECEAF3] bg-white/80 backdrop-blur-md p-5 shadow-[0_10px_40px_rgba(142,141,155,0.08)] transition-all duration-300 hover:-translate-y-0.5 motion-hover-lift">
                <summary className="list-none flex cursor-pointer items-center justify-between gap-4 font-bold text-[#373744]">
                  <span>{item.q}</span>
                  <ChevronDown className="w-4 h-4 text-[#8E8D9B] transition-transform group-open:rotate-180" />
                </summary>
                <p className="pt-4 text-sm leading-relaxed text-[#5E5D6A] max-w-3xl">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/60 bg-white/58 backdrop-blur-md py-8 text-center text-sm text-[#5E5D6A]/80">
        <div className="max-w-7xl mx-auto px-6 flex flex-col items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#373744]">Pastelle</span>
            <span className="text-[#8E8D9B]">PDF annotation toolkit</span>
          </div>
          <p className="opacity-70">&copy; 2026 Pastelle Toolkit. All rights reserved.</p>
        </div>
      </footer>

      {/* Toast Copy Notification */}
      <div 
        className={`fixed bottom-6 right-6 bg-[#E5D4FF] text-[#5E5D6A] py-3 px-6 rounded-full font-semibold text-xs shadow-lg z-50 flex items-center gap-2 transition-all duration-300 ${
          showToast ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
        }`}
      >
        <Check className="w-4 h-4 text-mint stroke-[2.5]" />
        <span>{toastMsg}</span>
      </div>

      {/* DUNA COOKIE BANNER COMPONENT */}
      {showCookie && (
        <div className="fixed bottom-6 right-6 md:right-12 bg-white/88 backdrop-blur-md border border-[#ECEAF3] p-4.5 rounded-2xl shadow-lg z-50 max-w-sm flex items-center justify-between gap-6 transition-all duration-300">
          <p className="text-xs text-charcoal-light leading-relaxed">
            We use cookies to personalize content, run ads, and analyze traffic.
          </p>
          <button 
            onClick={() => setShowCookie(false)}
            className="px-4 py-1.5 bg-charcoal hover:bg-charcoal/90 text-white font-bold text-[11px] rounded-lg transition-colors cursor-pointer"
          >
            Okay
          </button>
        </div>
      )}

    </div>
  );
}
