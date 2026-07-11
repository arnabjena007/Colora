"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Download, FileText, Layers3, PenTool, Sparkles } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen text-charcoal font-sans selection:bg-sky-blue/30 relative overflow-hidden bg-[#FBFAF8]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(229,212,255,0.40),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.92),rgba(251,250,248,0.96))]" />
      <div className="absolute inset-x-0 top-0 h-[520px] bg-[linear-gradient(180deg,rgba(255,255,255,0.70),rgba(255,255,255,0))]" />

      <header className="absolute top-0 left-0 right-0 z-50 py-6">
        <div className="max-w-7xl mx-auto px-6 flex justify-start items-center">
          <div className="flex items-center gap-2">
            <span className="font-sans font-bold text-2xl text-[#5E5D6A] tracking-tight flex items-center gap-1.5">
              <span className="text-xl text-[#8E8D9B]">✳</span> Colora
            </span>
          </div>
        </div>
      </header>

      <section id="overview" className="relative w-full min-h-screen flex flex-col justify-center px-6 py-24 overflow-hidden motion-fade-up">
        <Image
          src="/assets/hero_bg.png"
          alt="Colora watercolor landscape"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center motion-hero-pan"
        />

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
              Colora blends a soft premium interface with fast annotation tools, clean page controls, and a workspace that stays out of your way.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link href="/editor" className="inline-flex items-center gap-2 px-7 py-3.5 bg-[#E5D4FF] text-[#5E5D6A] hover:bg-[#F9D5E5] font-bold text-sm rounded-full transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 hover:scale-[1.01] motion-hover-lift">
                <ArrowUpRight className="w-4 h-4" />
                Getting started
              </Link>
              <a href="#features" className="inline-flex items-center gap-2 px-7 py-3.5 bg-white/72 backdrop-blur-md text-[#5E5D6A] hover:bg-white font-bold text-sm rounded-full transition-all shadow-sm border border-white/70 hover:scale-[1.01] motion-hover-lift">
                Explore features
              </a>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="relative z-10 py-16 md:py-20 motion-fade-up motion-delay-1">
        <div className="max-w-6xl mx-auto px-6">
          <div className="rounded-[34px] border border-white/70 bg-white/72 backdrop-blur-md p-5 md:p-7 shadow-[0_18px_60px_rgba(142,141,155,0.10)]">
            <div className="grid gap-4 md:grid-cols-[1.05fr_1fr] md:items-center">
              <div className="p-3 md:p-5">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#ECEAF3] bg-[#FBFAF8] text-[11px] font-bold uppercase tracking-[0.18em] text-[#8E8D9B] mb-4">
                  <Sparkles className="w-3.5 h-3.5" />
                  Simple by design
                </div>
                <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[#373744] mb-4">
                  Just the tools you need, without making the page feel busy
                </h2>
                <p className="text-sm md:text-base leading-relaxed text-[#5E5D6A] max-w-xl">
                  Colora keeps the landing page focused: open your document, mark it up, and export when you are done.
                </p>
              </div>

              <div className="grid gap-3">
                {[
                  { icon: FileText, title: "Open", text: "Start blank or bring in a PDF." },
                  { icon: PenTool, title: "Annotate", text: "Highlight, draw, add text, shapes, and notes." },
                  { icon: Download, title: "Export", text: "Save the finished document as a clean PDF." },
                ].map(item => (
                  <article key={item.title} className="flex items-start gap-4 rounded-[22px] border border-[#ECEAF3] bg-[#FBFAF8]/82 p-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#E5D4FF] text-[#5E5D6A]">
                      <item.icon className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="font-bold text-[#373744]">{item.title}</h3>
                      <p className="text-sm leading-relaxed text-[#5E5D6A]">{item.text}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 pb-20 md:pb-24 motion-fade-up motion-delay-2">
        <div className="max-w-6xl mx-auto px-6">
          <div className="rounded-[32px] border border-[#ECEAF3] bg-[#373744] px-6 py-8 text-center shadow-[0_20px_60px_rgba(55,55,68,0.14)] md:px-10">
            <Layers3 className="mx-auto mb-4 h-5 w-5 text-[#E5D4FF]" />
            <h2 className="mx-auto max-w-2xl text-2xl md:text-3xl font-bold tracking-tight text-white">
              Ready when you are. No extra panels, no extra decisions.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-white/70">
              Jump into the editor and keep the focus on the document.
            </p>
            <Link href="/editor" className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#E5D4FF] px-6 py-3 text-sm font-bold text-[#5E5D6A] transition-all hover:-translate-y-0.5 hover:bg-[#F9D5E5]">
              Open editor
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/60 bg-white/58 backdrop-blur-md py-6 text-center text-sm text-[#5E5D6A]/80">
        <div className="max-w-6xl mx-auto px-6 flex flex-col items-center gap-2">
          <div className="font-bold text-[#373744]">Colora</div>
          <p className="opacity-70">&copy; 2026 Colora Toolkit.</p>
        </div>
      </footer>
    </div>
  );
}
