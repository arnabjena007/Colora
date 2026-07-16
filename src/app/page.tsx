"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Download, FileText, GitBranch, Layers3, PenTool, Sparkles } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen text-charcoal font-sans selection:bg-sky-blue/30 relative overflow-hidden bg-[#FBFAF8]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(229,212,255,0.40),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.92),rgba(251,250,248,0.96))]" />
      <div className="absolute inset-x-0 top-0 h-[520px] bg-[linear-gradient(180deg,rgba(255,255,255,0.70),rgba(255,255,255,0))]" />

      <header className="absolute top-0 left-0 right-0 z-50 py-6">
        <div className="max-w-7xl mx-auto px-6 flex justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="font-sans font-bold text-2xl text-[#5E5D6A] tracking-tight flex items-center gap-1.5">
              <span className="text-xl text-[#8E8D9B]">✳</span> Colora
            </span>
          </div>
          <a
            href="https://github.com/arnabjena007/Colora"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/72 px-5 py-2.5 text-sm font-bold text-[#5E5D6A] shadow-sm backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-white"
          >
            <GitBranch className="h-4 w-4" />
            Contribute
          </a>
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

      <div className="pointer-events-none absolute inset-x-0 top-[100vh] bottom-0 z-0 overflow-hidden bg-[radial-gradient(circle_at_50%_0%,rgba(229,212,255,0.38),transparent_30%),radial-gradient(circle_at_24%_16%,rgba(214,239,255,0.28),transparent_20%),radial-gradient(circle_at_76%_22%,rgba(249,213,229,0.24),transparent_18%),linear-gradient(180deg,#FEFCFF_0%,#F8F6FD_100%)]">
        <div className="pastel-glow-a absolute left-[6%] top-[4%] h-[34vw] min-h-[280px] w-[34vw] min-w-[280px] rounded-full bg-[radial-gradient(circle,rgba(210,224,255,0.65)_0%,rgba(210,224,255,0.24)_42%,rgba(210,224,255,0)_74%)] blur-[22px]" />
        <div className="pastel-glow-b absolute right-[3%] top-[8%] h-[30vw] min-h-[240px] w-[30vw] min-w-[240px] rounded-full bg-[radial-gradient(circle,rgba(245,208,228,0.60)_0%,rgba(245,208,228,0.22)_44%,rgba(245,208,228,0)_74%)] blur-[20px]" />
        <div className="pastel-glow-c absolute bottom-[18%] left-[18%] h-[28vw] min-h-[220px] w-[28vw] min-w-[220px] rounded-full bg-[radial-gradient(circle,rgba(255,233,182,0.52)_0%,rgba(255,233,182,0.18)_42%,rgba(255,233,182,0)_72%)] blur-[24px]" />
        <div className="pastel-glow-a-reverse absolute bottom-[4%] right-[12%] h-[26vw] min-h-[210px] w-[26vw] min-w-[210px] rounded-full bg-[radial-gradient(circle,rgba(196,234,220,0.58)_0%,rgba(196,234,220,0.18)_42%,rgba(196,234,220,0)_72%)] blur-[24px]" />
      </div>

      <section className="relative z-10 -mt-20 pb-16 md:-mt-24 md:pb-20 motion-fade-up motion-delay-1">
        <div className="max-w-6xl mx-auto px-6">
          <div className="relative overflow-hidden rounded-[30px] border border-white/80 bg-white shadow-[0_28px_90px_rgba(142,141,155,0.20)]">
            <video
              src="/assets/colora-demo.mp4"
              autoPlay
              muted
              playsInline
              preload="metadata"
              className="block aspect-video w-full object-cover"
              aria-label="Colora editor demo video"
            />
          </div>
        </div>
      </section>

      <section id="features" className="relative z-10 pb-16 md:pb-20 motion-fade-up motion-delay-1">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { icon: FileText, title: "Open anything", text: "Start with a blank page or bring in a PDF/image from your device." },
              { icon: PenTool, title: "Mark it naturally", text: "Highlight, draw, type, add notes, and place shapes without tool clutter." },
              { icon: Download, title: "Export cleanly", text: "Keep your edits aligned and export the final document as a PDF." },
            ].map(item => (
              <article key={item.title} className="rounded-[28px] border border-white/75 bg-white/74 p-6 shadow-[0_18px_60px_rgba(142,141,155,0.10)] backdrop-blur-md transition-all hover:-translate-y-1 hover:bg-white">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#E5D4FF] text-[#5E5D6A] shadow-sm">
                  <item.icon className="h-5 w-5" />
                </div>
                <h3 className="mb-2 text-xl font-bold tracking-tight text-[#373744]">{item.title}</h3>
                <p className="text-sm leading-relaxed text-[#5E5D6A]">{item.text}</p>
              </article>
            ))}
          </div>
          <div className="mt-5 rounded-[30px] border border-white/75 bg-[#FBFAF8]/78 p-6 text-center shadow-[0_18px_60px_rgba(142,141,155,0.10)] backdrop-blur-md md:p-8">
            <div className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[#8E8D9B]">
              <Sparkles className="h-3.5 w-3.5" />
              Simple by design
            </div>
            <h2 className="mx-auto max-w-3xl text-3xl font-bold tracking-tight text-[#373744] md:text-4xl">
              A lighter way to review, annotate, and finish documents
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-[#5E5D6A] md:text-base">
              Colora keeps the workspace calm, saves your latest local draft, and keeps the important controls close without overwhelming the page.
            </p>
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
