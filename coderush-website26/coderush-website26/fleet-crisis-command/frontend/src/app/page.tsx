"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useMemo, useState } from "react";

import { OperationalBackdrop } from "@/components/scene/OperationalBackdrop";

const HULLS = Array.from({ length: 15 }, (_, i) => `MV-${i + 1}`);

export default function Home() {
  const [hull, setHull] = useState("MV-1");
  const captainHref = useMemo(() => `/captain/${encodeURIComponent(hull)}`, [hull]);

  return (
    <OperationalBackdrop variant="portal">
      <main className="relative min-h-screen px-4 py-14 md:py-24">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7 }}
          className="pointer-events-none absolute left-1/2 top-[8%] h-56 w-[min(980px,90vw)] -translate-x-1/2 rounded-full bg-gradient-to-r from-cyan-500/[0.15] via-violet-500/[0.1] to-amber-500/[0.12] blur-3xl"
        />

        <div className="relative mx-auto max-w-5xl [perspective:1600px]">
          <motion.header
            className="mb-12 text-center"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
          >
            <p className="text-[11px] uppercase tracking-[0.55em] text-slate-500">Fleet crisis command · portal</p>
            <h1 className="mt-4 bg-gradient-to-br from-white via-slate-200 to-slate-500 bg-clip-text text-3xl font-semibold tracking-tight text-transparent md:text-5xl">
              Hormuz SOC / Bridge ingress
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-sm text-slate-400">
              Step into omniscient command or a segmented captain datalink. Interface uses animated depth cues — layered glass, drifting grid mesh, holographic lifts.
            </p>
          </motion.header>

          <motion.div className="grid gap-10 md:grid-cols-2 md:gap-14">
            <PortalCard
              href="/command"
              accentBorder="border-cyan-400/55"
              glow="shadow-[0_24px_80px_rgba(34,211,238,0.18)]"
              label="SOC / Red cell"
              title="Central command"
              body="Shared operating picture · zone authoring · multi-route overlays · predictive stack · AI advisor arbitration."
              ctaLabel="Launch command COP"
              index={0}
            />
            <motion.section
              className={`relative rounded-3xl border border-amber-500/35 bg-gradient-to-br from-black/42 via-[#1a1308]/92 to-transparent p-[1px] shadow-[0_24px_80px_rgba(251,113,133,0.12)]`}
              style={{ transformStyle: "preserve-3d", transformPerspective: 1200 }}
              initial={{ opacity: 0, y: 32, rotateX: 14 }}
              animate={{ opacity: 1, y: 0, rotateX: 4 }}
              whileHover={{
                rotateX: 8,
                rotateY: -5,
                y: -6,
                boxShadow: "0 42px 100px rgba(251,176,92,0.22)",
              }}
              transition={{ type: "spring", stiffness: 165, damping: 20, delay: 0.1 }}
            >
              <div className="rounded-[calc(1.5rem-1px)] border border-amber-400/45 bg-black/62 p-8 backdrop-blur-xl">
                <p className="text-[11px] uppercase tracking-[0.42em] text-amber-200/95">Captain / Bridge</p>
                <h2 className="mt-3 text-3xl font-semibold text-amber-50 md:text-[2rem]">Hull-local picture</h2>
                <p className="mt-3 text-sm leading-relaxed text-amber-100/60">
                  Filtered payloads: your hull, correlated alerts, directives, inbound assist cues only — isolated from foreign tracks.
                </p>
                <label className="mt-8 block text-left text-xs font-medium uppercase tracking-[0.2em] text-amber-200/85">
                  Hull ID
                  <select
                    className="mt-2 w-full rounded-xl border border-amber-500/48 bg-black/72 px-3 py-2.5 text-sm font-normal capitalize tracking-normal text-amber-50 shadow-inner shadow-black/55"
                    value={hull}
                    onChange={(e) => setHull(e.target.value)}
                  >
                    {HULLS.map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="mt-10">
                  <Link
                    href={captainHref}
                    className="block rounded-xl border border-amber-400/72 bg-gradient-to-r from-amber-500/[0.2] via-amber-600/[0.12] to-amber-500/[0.18] px-4 py-[0.875rem] text-center text-[15px] font-semibold text-amber-50 shadow-inner shadow-black/55 transition hover:from-amber-500/[0.3] hover:shadow-xl"
                  >
                    Enter bridge · <span className="font-mono">{hull}</span>
                  </Link>
                  <p className="mt-4 text-center text-[11px] text-amber-200/42">Captain role · segmented mesh</p>
                </div>
              </div>
            </motion.section>
          </motion.div>

          <p className="mt-16 pb-6 text-center text-[11px] text-slate-600">Compose: <code className="rounded bg-white/5 px-1 py-0.5 font-mono text-slate-400">docker compose up</code></p>
        </div>
      </main>
    </OperationalBackdrop>
  );
}

function PortalCard({
  href,
  accentBorder,
  glow,
  label,
  title,
  body,
  ctaLabel,
  index,
}: {
  href: string;
  accentBorder: string;
  glow: string;
  label: string;
  title: string;
  body: string;
  ctaLabel: string;
  index: number;
}) {
  return (
    <motion.section
      className={`relative rounded-3xl border ${accentBorder} bg-gradient-to-br from-black/45 via-cyan-950/25 to-transparent p-[1px] ${glow}`}
      style={{ transformStyle: "preserve-3d", transformPerspective: 1200 }}
      initial={{ opacity: 0, y: 32, rotateX: 14 }}
      animate={{ opacity: 1, y: 0, rotateX: 4 }}
      whileHover={{
        rotateX: -6,
        rotateY: 5,
        y: -6,
        transition: { type: "spring", stiffness: 220, damping: 20 },
      }}
      transition={{ type: "spring", stiffness: 165, damping: 20, delay: index * 0.08 }}
    >
      <Link href={href} className="group block rounded-[calc(1.5rem-1px)] bg-black/62 p-8 backdrop-blur-xl">
        <p className="text-[11px] uppercase tracking-[0.42em] text-cyan-200/92">{label}</p>
        <h2 className="mt-3 text-3xl font-semibold text-white md:text-[2rem]">{title}</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">{body}</p>
        <motion.span className="mt-10 inline-block w-full rounded-xl border border-cyan-400/70 bg-gradient-to-br from-cyan-500/[0.2] via-cyan-600/[0.08] to-slate-900/40 px-4 py-[0.875rem] text-center text-[15px] font-semibold text-cyan-50 shadow-lg shadow-black/65 transition group-hover:border-cyan-300/95 group-hover:shadow-cyan-500/25">
          {ctaLabel}
        </motion.span>
        <p className="mt-4 text-center text-[11px] text-slate-500 group-hover:text-cyan-200/85">Dedicated mesh · full COP</p>
      </Link>
    </motion.section>
  );
}
