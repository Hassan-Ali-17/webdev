"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const VARIANT = {
  command: {
    orbA: "from-cyan-500/55 via-teal-500/25 to-transparent",
    orbB: "from-violet-600/35 via-fuchsia-500/20 to-transparent",
    orbC: "from-sky-400/35 to-transparent",
    grid: "[--grid-line:rgba(34,211,238,0.09)] [--grid-major:rgba(34,211,238,0.16)]",
    vignette: "from-[#030712] via-transparent to-[#030712]",
  },
  captain: {
    orbA: "from-amber-500/45 via-orange-600/20 to-transparent",
    orbB: "from-rose-900/40 via-amber-900/15 to-transparent",
    orbC: "from-yellow-500/25 to-transparent",
    grid: "[--grid-line:rgba(251,191,36,0.08)] [--grid-major:rgba(251,113,133,0.12)]",
    vignette: "from-[#0c0a06] via-transparent to-[#020617]",
  },
  portal: {
    orbA: "from-cyan-500/50 via-emerald-500/15 to-transparent",
    orbB: "from-amber-600/35 via-orange-900/10 to-transparent",
    orbC: "from-blue-600/25 to-transparent",
    grid: "[--grid-line:rgba(148,163,184,0.06)] [--grid-major:rgba(34,211,238,0.1)]",
    vignette: "from-[#020617] via-transparent to-[#020617]",
  },
} as const;

export function OperationalBackdrop({ variant, className, children }: { variant: keyof typeof VARIANT; className?: string; children: ReactNode }) {
  const pal = VARIANT[variant];

  return (
    <div className={cn("relative isolate min-h-screen overflow-hidden bg-[#020617] text-slate-100", className)}>
      <div className="pointer-events-none absolute inset-0 opacity-95">
        <motion.div
          className={`absolute -left-[20%] -top-[30%] h-[70vmin] w-[70vmin] rounded-full bg-gradient-to-br ${pal.orbA} blur-3xl`}
          animate={{ x: [0, 40, 0], y: [0, 24, 0], scale: [1, 1.08, 1] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className={`absolute -right-[15%] top-[10%] h-[55vmin] w-[55vmin] rounded-full bg-gradient-to-bl ${pal.orbB} blur-3xl`}
          animate={{ x: [0, -32, 0], y: [0, 36, 0], scale: [1, 1.06, 1] }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className={`absolute bottom-[-25%] left-[25%] h-[65vmin] w-[65vmin] rounded-full bg-gradient-to-t ${pal.orbC} blur-[100px]`}
          animate={{ rotate: [0, 8, 0], scale: [1, 1.02, 1] }}
          transition={{ duration: 28, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <div className="scene-perspective pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          className={cn(
            "scene-floor absolute left-[-50%] top-[18%] h-[140%] w-[220%] opacity-[0.32]",
            "bg-[length:52px_52px]",
            "[background-image:linear-gradient(to_right,var(--grid-line)_1px,transparent_1px),linear-gradient(to_bottom,var(--grid-line)_1px,transparent_1px)]",
            pal.grid,
          )}
          initial={{ rotateX: 68, rotateZ: -3.5, y: 0 }}
          animate={{
            rotateX: 68,
            rotateZ: [-3.5, -2, -3.5],
            y: [0, 22, 0],
          }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: "50% 45%", transformStyle: "preserve-3d" }}
        />
      </div>

      <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-b", pal.vignette, "opacity-90")} />
      <div className="pointer-events-none absolute inset-0 scanlines opacity-[0.035]" aria-hidden />

      <div className="relative z-10">{children}</div>
    </div>
  );
}

/** Subtle tilt + lift for HUD panels — use on cards that should feel “mounted” in 3D space. */
export function HoloSurface({
  delay = 0,
  hoverable = true,
  className,
  children,
}: {
  delay?: number;
  hoverable?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 22, rotateX: 8 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ type: "spring", stiffness: 175, damping: 24, delay }}
      style={{ transformStyle: "preserve-3d", transformPerspective: 1200 }}
      whileHover={
        hoverable
          ? { y: -3, rotateX: 3, rotateY: -2, transition: { type: "spring", stiffness: 280, damping: 22 } }
          : undefined
      }
      className={cn("transform-gpu will-change-transform", className)}
    >
      {children}
    </motion.div>
  );
}
