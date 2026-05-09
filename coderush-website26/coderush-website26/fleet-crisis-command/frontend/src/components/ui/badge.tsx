"use client";

import type { FC, ReactNode } from "react";

import { cn } from "@/lib/utils";

export const Card: FC<{ className?: string; children: ReactNode }> = ({ className, children }) => (
  <div className={cn("glass-panel p-4", className)}>{children}</div>
);

export function Badge({
  variant = "muted",
  label,
}: {
  variant?: "danger" | "warn" | "cool" | "muted";
  label: string;
}) {
  const map = {
    danger: "border border-red-400/80 bg-red-500/20 text-red-200",
    warn: "border border-amber-400/80 bg-amber-500/20 text-amber-100",
    cool: "border border-cyan-400/70 bg-cyan-500/15 text-cyan-50",
    muted: "border border-slate-600 bg-slate-800 text-slate-200",
  } as const;
  return <span className={cn("inline-flex rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide", map[variant])}>{label}</span>;
}
