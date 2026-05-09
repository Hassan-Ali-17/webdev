"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "neon" | "ghost" }) {
  const variant = props.variant ?? "neon";
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center rounded px-4 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400",
        variant === "neon" &&
          "border border-cyan-400/70 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-400/30 disabled:opacity-40",
        variant === "ghost" && "border border-transparent text-slate-200 hover:border-slate-600",
        props.className,
      )}
    />
  );
}
