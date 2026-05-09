"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { FleetShip, FleetSnapshot, LatLng } from "@/lib/types";

/** Advance [lat,lng] along true-north heading (deg) at speed (knots) for dt seconds. */
function advanceLatLng(pos: LatLng, headingDeg: number, knots: number, dtSec: number): LatLng {
  const distM = knots * 0.514444 * Math.max(0, dtSec);
  if (distM < 1e-6) return pos;
  const R = 6371000;
  const φ1 = (pos[0] * Math.PI) / 180;
  const λ1 = (pos[1] * Math.PI) / 180;
  const θ = (headingDeg * Math.PI) / 180;
  const δ = distM / R;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(
    Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
    Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
  );
  const lat = (φ2 * 180) / Math.PI;
  let lng = (λ2 * 180) / Math.PI;
  lng = ((lng + 540) % 360) - 180;
  return [lat, lng];
}

function blendPosition(a: LatLng, b: LatLng, alpha: number): LatLng {
  return [a[0] + (b[0] - a[0]) * alpha, a[1] + (b[1] - a[1]) * alpha];
}

const NO_DRIFT = new Set(["arrived", "stranded", "out_of_fuel"]);

export function useInterpolatedFleet(snapshot: FleetSnapshot | null) {
  const snapRef = useRef<FleetSnapshot | null>(null);
  const positionsRef = useRef<Record<string, LatLng>>({});
  const lastFrameRef = useRef<number | null>(null);
  const [renderShips, setRenderShips] = useState<FleetShip[]>([]);

  useEffect(() => {
    snapRef.current = snapshot;
    if (!snapshot?.ships?.length) {
      positionsRef.current = {};
      setRenderShips([]);
      return;
    }
    lastFrameRef.current = performance.now();
    const ids = new Set(snapshot.ships.map((s) => s.shipId));
    for (const k of Object.keys(positionsRef.current)) {
      if (!ids.has(k)) delete positionsRef.current[k];
    }
    for (const s of snapshot.ships) {
      if (!positionsRef.current[s.shipId]) {
        positionsRef.current[s.shipId] = [...s.position] as LatLng;
      }
    }
    setRenderShips(
      snapshot.ships.map((s) => ({
        ...s,
        position: [...(positionsRef.current[s.shipId] ?? s.position)] as LatLng,
        route: s.route.map((p) => [...p] as LatLng),
      })),
    );
  }, [snapshot]);

  useEffect(() => {
    let raf = 0;
    const loop = (now: number) => {
      const snap = snapRef.current;
      if (!snap?.ships?.length) {
        lastFrameRef.current = now;
        raf = requestAnimationFrame(loop);
        return;
      }
      const prevT = lastFrameRef.current ?? now;
      const dt = Math.min(0.22, Math.max(0, (now - prevT) / 1000));
      lastFrameRef.current = now;

      if (dt <= 0) {
        raf = requestAnimationFrame(loop);
        return;
      }

      const next: FleetShip[] = snap.ships.map((s) => {
        const auth = [...s.position] as LatLng;
        const cur = positionsRef.current[s.shipId] ?? auth;
        if (NO_DRIFT.has(s.status) || s.holding) {
          positionsRef.current[s.shipId] = [...auth];
          return { ...s, position: auth, route: s.route.map((p) => [...p] as LatLng) };
        }
        let blended = advanceLatLng(cur, s.heading, s.speed, dt);
        blended = blendPosition(blended, auth, 0.14);
        positionsRef.current[s.shipId] = blended;
        return { ...s, position: blended, route: s.route.map((p) => [...p] as LatLng) };
      });
      setRenderShips(next);

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return useMemo(() => {
    if (!snapshot) return { ships: [] as FleetShip[], view: null as FleetSnapshot | null };
    if (!renderShips.length && snapshot.ships.length) {
      return { ships: snapshot.ships, view: snapshot };
    }
    return { ships: renderShips, view: { ...snapshot, ships: renderShips } };
  }, [renderShips, snapshot]);
}
