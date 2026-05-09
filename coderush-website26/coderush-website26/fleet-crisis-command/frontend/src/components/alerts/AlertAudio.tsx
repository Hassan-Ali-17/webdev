"use client";

import { useEffect, useMemo, useRef } from "react";

export function AlertAudio({ alertIds }: { alertIds: string[] }) {
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    alertIds.forEach((id) => {
      if (!seen.current.has(id)) {
        seen.current.add(id);
        playBeep();
      }
    });
  }, [alertIds]);

  return null;
}

function playBeep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 520;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.28);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
    osc.onended = () => ctx.close();
  } catch {
    /* no audio */
  }
}
