"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";

import { AlertAudio } from "@/components/alerts/AlertAudio";
import { HoloSurface, OperationalBackdrop } from "@/components/scene/OperationalBackdrop";
import { Badge, Card } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useFleetSocket } from "@/hooks/useFleetSocket";
import { useInterpolatedFleet } from "@/hooks/useInterpolatedFleet";
import type { FleetShip, FleetSnapshot, LatLng } from "@/lib/types";

const FleetMap = dynamic(() => import("@/components/map/FleetMap").then((m) => m.FleetMap), { ssr: false });

const REST = process.env.NEXT_PUBLIC_REST_URL ?? "http://localhost:5001";

const ROUTE_PROFILES = ["fastest", "safest", "fuel_efficient"] as const;

export default function CommandPage() {
  const { emit, snapshot, connected, assistSuggestions, commandToasts } = useFleetSocket({ role: "command" });
  const { ships, view } = useInterpolatedFleet(snapshot);

  const [selected, setSelected] = useState<string>("MV-1");
  const [compareRoutes, setCompareRoutes] = useState(false);
  const [history, setHistory] = useState<Array<{ ts: number; payload: FleetSnapshot["ships"] }>>([]);
  const [timeline, setTimeline] = useState(100);
  const [playback, setPlayback] = useState(false);
  const [routeProfile, setRouteProfile] = useState<(typeof ROUTE_PROFILES)[number]>("safest");
  const [reroutePortId, setReroutePortId] = useState<string>("");
  const [waypointLat, setWaypointLat] = useState("");
  const [waypointLng, setWaypointLng] = useState("");

  useEffect(() => {
    fetch(`${REST}/api/history`)
      .then((res) => res.json())
      .then((entries) =>
        setHistory(
          (entries as Array<{ ts: number; payload: { ships: FleetSnapshot["ships"] } }>).map((e) => ({
            ts: e.ts,
            payload: e.payload.ships,
          })),
        ),
      )
      .catch(() => setHistory([]));
  }, []);

  const selectedShip = ships.find((s) => s.shipId === selected);

  useEffect(() => {
    const ports = snapshot?.ports ?? [];
    if (!ports.length || !selectedShip) return;
    const byDest = ports.find(
      (p) => p.name === selectedShip.destination || selectedShip.destination.includes(p.name) || selectedShip.destination.includes(p.id),
    );
    setReroutePortId(byDest?.id ?? ports[0].id);
  }, [snapshot?.ports, selected, selectedShip]);

  useEffect(() => {
    const p = selectedShip?.selected_route_profile;
    if (p === "fastest" || p === "safest" || p === "fuel_efficient") {
      setRouteProfile(p);
    }
  }, [selectedShip?.selected_route_profile]);

  const compareOverlay = useMemo(() => {
    if (!compareRoutes || !selectedShip?.route_options) return null;
    const map: Record<string, LatLng[]> = {};
    (["fastest", "safest", "fuel_efficient"] as const).forEach((key) => {
      const cand = selectedShip.route_options?.[key];
      if (cand) map[`${key}_${selectedShip.shipId}`] = cand.nodes;
    });
    return map;
  }, [compareRoutes, selectedShip]);

  const alertIds = useMemo(() => snapshot?.alerts.filter((a) => !a.acknowledged).map((a) => a.uuid) ?? [], [snapshot]);

  const scrubShips: FleetSnapshot["ships"] =
    playback && history.length
      ? history[Math.max(0, Math.min(history.length - 1, Math.floor((timeline / 100) * (history.length - 1))))]?.payload ??
        ships
      : ships;

  const mapPayload: FleetSnapshot | null =
    snapshot && playback ? { ...snapshot, ships: scrubShips } : view ?? snapshot ?? null;

  const assistQueue = snapshot?.assistance ?? [];

  function applyWaypoint() {
    const lat = Number(waypointLat);
    const lng = Number(waypointLng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return;
    }
    emit("directive_issue", { ship_id: selected, type: "divert_waypoint", payload: { position: [lat, lng] } });
  }

  return (
    <OperationalBackdrop variant="command">
      <motion.header
        initial={{ opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 26 }}
        className="border-b border-cyan-400/20 bg-black/55 shadow-[inset_0_-1px_0_rgba(34,211,238,0.12),0_8px_48px_rgba(0,0,0,0.45)] backdrop-blur-2xl"
      >
        <div className="mx-auto flex max-w-[1680px] flex-wrap items-center justify-between gap-4 px-5 py-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.45em] text-cyan-300/85">SOC · centralized command</p>
            <h1 className="text-2xl font-semibold text-white md:text-3xl">{snapshot?.scenario.name ?? "Strait Crisis"}</h1>
            <p className="max-w-2xl text-xs text-slate-400">
              Omniscient track — {snapshot?.fleet_contact_count ?? ships.length} hulls on common operating picture. Bonuses: multi-route,
              predictive alerts, assist mesh, AI advisor.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {connected ? <Badge variant="cool" label="MESH LIVE" /> : <Badge variant="danger" label="OFFLINE" />}
            {snapshot?.view_role === "command" ? <Badge variant="muted" label="OMNISCIENT" /> : null}
            <motion.div whileHover={{ y: -1, rotateX: 4 }} whileTap={{ scale: 0.98 }} style={{ transformPerspective: 800 }}>
              <Link
                href="/"
                className="inline-block rounded border border-slate-500/60 bg-slate-900/70 px-3 py-1 text-[11px] text-slate-200 shadow-lg shadow-cyan-900/20 transition hover:border-cyan-400/55 hover:text-cyan-50"
              >
                Portal
              </Link>
            </motion.div>
          </div>
        </div>
      </motion.header>

      {commandToasts.length ? (
        <div className="pointer-events-none fixed right-4 top-20 z-[1200] flex max-w-[min(440px,calc(100vw-2rem))] flex-col gap-2">
          {commandToasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 28, rotateY: -8 }}
              animate={{ opacity: 1, x: 0, rotateY: 0 }}
              role="status"
              style={{ transformPerspective: 900 }}
              className={`pointer-events-auto rounded-lg border px-3 py-2 text-xs shadow-xl backdrop-blur-xl ${
                t.severity === "error"
                  ? "border-rose-500/55 bg-rose-950/90 text-rose-100 shadow-rose-900/40"
                  : "border-cyan-400/40 bg-[#050e18]/94 text-slate-100 shadow-cyan-900/30"
              }`}
            >
              {t.text}
            </motion.div>
          ))}
        </div>
      ) : null}

      <div className="mx-auto grid max-w-[1680px] gap-4 p-4 lg:grid-cols-[220px_1fr_360px] lg:[perspective:2000px]">
        <HoloSurface delay={0.06} className="h-fit lg:sticky lg:top-4">
          <Card className="border-cyan-400/25 p-3 shadow-[0_14px_50px_rgba(0,0,0,0.35)] shadow-cyan-900/25">
          <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-400/80">Hull pick</p>
          <ul className="mt-3 max-h-[70vh] space-y-1 overflow-y-auto text-xs">
            {ships.map((s) => (
              <li key={s.shipId}>
                <button
                  type="button"
                  onClick={() => setSelected(s.shipId)}
                  className={`flex w-full flex-col rounded border px-2 py-2 text-left transition ${
                    selected === s.shipId
                      ? "border-cyan-400/80 bg-cyan-500/15 text-white shadow-[0_0_18px_rgba(34,211,238,0.25)]"
                      : "border-transparent bg-slate-900/50 text-slate-300 hover:border-slate-600"
                  }`}
                >
                  <span className="font-semibold">{s.name}</span>
                  <span className="text-[10px] text-slate-500">{s.shipId}</span>
                  <span className="text-[10px] uppercase text-cyan-200/70">{s.status}</span>
                </button>
              </li>
            ))}
          </ul>
          </Card>
        </HoloSurface>

        <div className="space-y-3">
          <AlertAudio alertIds={alertIds} />

          <HoloSurface hoverable={false} delay={0.1}>
            <Card className="relative overflow-hidden border-cyan-400/30 p-0 shadow-[0_20px_60px_rgba(0,0,0,0.5)] shadow-cyan-900/35">
            <div className="absolute left-4 top-3 z-[500] flex max-w-[92%] flex-wrap items-center gap-2">
              <Button type="button" variant="neon" className="text-[11px]" onClick={() => emit("route_profiles", { ship_id: selected })}>
                Route matrix
              </Button>
              <label className="flex items-center gap-1 rounded border border-white/10 bg-black/70 px-2 py-1 text-[10px] text-slate-400">
                <span className="whitespace-nowrap text-slate-500">Profile</span>
                <select
                  className="max-w-[120px] rounded border border-slate-600 bg-slate-950 px-1 py-0.5 text-[10px] text-slate-200"
                  value={routeProfile}
                  onChange={(ev) => setRouteProfile(ev.target.value as (typeof ROUTE_PROFILES)[number])}
                >
                  {ROUTE_PROFILES.map((p) => (
                    <option key={p} value={p}>
                      {p.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="button" variant="ghost" className="text-[11px]" onClick={() => emit("route_select", { ship_id: selected, profile: routeProfile })}>
                Apply profile
              </Button>
              <Button type="button" variant="neon" className="text-[11px]" onClick={() => setCompareRoutes((v) => !v)}>
                {compareRoutes ? "Hide compare" : "Compare routes"}
              </Button>
              <Button type="button" variant="ghost" className="text-[11px]" onClick={() => setPlayback((v) => !v)}>
                {playback ? "Live" : "Replay"}
              </Button>
              {compareRoutes ? (
                <div className="flex flex-wrap gap-2 rounded border border-white/10 bg-black/65 px-2 py-1 text-[10px] text-slate-300">
                  <Legend dot="#fcd34d" label="Fastest" />
                  <Legend dot="#7dd3fc" label="Safest" />
                  <Legend dot="#86efac" label="Fuel-efficient" />
                </div>
              ) : null}
            </div>

            <FleetMap
              snapshot={mapPayload}
              ships={playback ? scrubShips : ships}
              highlightId={selected}
              onPickShip={setSelected}
              canDrawZones
              compareRoutes={compareOverlay}
              mode="command"
              onZoneCommitted={(poly) =>
                emit("zone_upsert", {
                  uuid: crypto.randomUUID(),
                  name: `NOGO-${(snapshot?.zones.length ?? 0) + 1}`,
                  coordinates: poly,
                })
              }
            />

            <motion.div layout className="glass-panel flex flex-wrap items-center gap-3 border-t border-cyan-500/15 px-3 py-2 text-[11px]">
              <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-slate-400">
                Telemetry playback ({history.length} frames)
                <input
                  type="range"
                  min={0}
                  max={100}
                  disabled={!history.length || !playback}
                  value={timeline}
                  className="w-full accent-cyan-400 disabled:opacity-30"
                  onChange={(ev) => setTimeline(Number(ev.target.value))}
                />
              </label>
            </motion.div>
            </Card>
          </HoloSurface>

          <HoloSurface delay={0.14}>
            <Card className="border-emerald-400/35 bg-emerald-950/[0.07] shadow-lg shadow-emerald-950/30">
            <div className="flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-[0.28em] text-emerald-200/85">Assist queue (bonus)</p>
              <Badge label={`${assistQueue.filter((x) => x.status === "pending").length}`} variant="muted" />
            </div>
            <ul className="mt-3 space-y-2 text-[11px] text-slate-300">
              {assistQueue.slice(0, 12).map((a) => (
                <li key={String(a.uuid)} className="flex flex-wrap items-center justify-between gap-2 rounded border border-white/10 bg-black/40 px-3 py-2">
                  <span>
                    <strong>{String(a.requesting_ship_id)}</strong> → <strong>{String(a.target_ship_id ?? "SOC")}</strong> ·{" "}
                    {String(a.aid_type)}{" "}
                    <Badge label={String(a.status)} variant={String(a.status) === "pending" ? "warn" : "muted"} />
                  </span>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="neon"
                      className="px-2 py-0.5 text-[10px]"
                      onClick={() => emit("assistance_resolve", { uuid: a.uuid, status: "accepted" })}
                    >
                      SOC accept
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="px-2 py-0.5 text-[10px]"
                      onClick={() => emit("assistance_resolve", { uuid: a.uuid, status: "declined" })}
                    >
                      Close
                    </Button>
                  </div>
                </li>
              ))}
              {!assistQueue.length ? <li className="text-slate-500">No open assistance contracts.</li> : null}
            </ul>
            </Card>
          </HoloSurface>
        </div>

        <div className="space-y-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto">
          <HoloSurface delay={0.08}>
            <Card className="border-cyan-400/28 shadow-md shadow-black/40">
            <p className="text-[10px] uppercase text-slate-500">Targeting</p>
            {selectedShip ? (
              <div className="mt-2 space-y-2 text-xs">
                <p className="text-lg font-semibold text-white">
                  {selectedShip.name}{" "}
                  <Badge label={selectedShip.status} variant={selectedShip.status === "normal" ? "muted" : "danger"} />
                </p>
                <p className="text-slate-500">{selectedShip.cargo}</p>
                <GridStat ship={selectedShip} />
                <div className="space-y-2 pt-2">
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="flex min-w-[160px] flex-1 flex-col gap-1 text-[10px] text-slate-500">
                      Reroute to port
                      <select
                        className="rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-[11px] text-slate-200"
                        value={reroutePortId}
                        onChange={(ev) => setReroutePortId(ev.target.value)}
                      >
                        {(snapshot?.ports ?? []).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.id})
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button
                      type="button"
                      variant="neon"
                      className="text-[11px]"
                      disabled={!reroutePortId}
                      onClick={() => emit("directive_issue", { ship_id: selected, type: "reroute_port", payload: { port_id: reroutePortId } })}
                    >
                      Issue reroute
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="flex flex-1 flex-col gap-1 text-[10px] text-slate-500">
                      Waypoint lat
                      <input
                        type="number"
                        step="any"
                        placeholder="26.05"
                        value={waypointLat}
                        onChange={(ev) => setWaypointLat(ev.target.value)}
                        className="rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-[11px] text-slate-200"
                      />
                    </label>
                    <label className="flex flex-1 flex-col gap-1 text-[10px] text-slate-500">
                      lng
                      <input
                        type="number"
                        step="any"
                        placeholder="56.25"
                        value={waypointLng}
                        onChange={(ev) => setWaypointLng(ev.target.value)}
                        className="rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-[11px] text-slate-200"
                      />
                    </label>
                    <Button type="button" variant="ghost" className="text-[11px]" onClick={applyWaypoint}>
                      Issue waypoint
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="ghost" className="text-[11px]" onClick={() => emit("directive_issue", { ship_id: selected, type: "hold", payload: {} })}>
                      Hold
                    </Button>
                    <Button type="button" variant="neon" className="text-[11px]" onClick={() => emit("helper_suggestions", { ship_id: selected })}>
                      Scan neighbors
                    </Button>
                  </div>
                </div>
                <div className="text-[10px] text-slate-500">
                  {assistSuggestions.slice(0, 4).map((h) => (
                    <p key={String(h.ship_id)}>
                      {(h.name as string) ?? String(h.ship_id)} · {(Number(h.distance_nm) || 0).toFixed(1)} nm
                    </p>
                  ))}
                  <p className="mt-1 text-slate-600">Captains originate assist; SOC arbitrates in the queue ↓</p>
                </div>
              </div>
            ) : null}
            </Card>
          </HoloSurface>

          <HoloSurface delay={0.1}>
            <Card className="border-cyan-400/28 shadow-md shadow-black/40">
            <p className="text-[10px] uppercase text-slate-500">Restricted zones</p>
            <ul className="mt-2 max-h-[200px] space-y-1.5 overflow-y-auto text-[11px]">
              {(snapshot?.zones ?? []).map((z) => (
                <li key={z.uuid} className="flex items-center justify-between gap-2 rounded border border-white/10 bg-black/40 px-2 py-1.5">
                  <span className="min-w-0 truncate text-slate-300" title={z.name}>
                    {z.name}
                  </span>
                  <Button type="button" variant="ghost" className="shrink-0 px-2 py-0.5 text-[10px] text-rose-300" onClick={() => emit("zone_delete", { uuid: z.uuid })}>
                    Delete
                  </Button>
                </li>
              ))}
              {!(snapshot?.zones ?? []).length ? <li className="text-slate-500">Draw on the map to add a NO-GO zone.</li> : null}
            </ul>
            </Card>
          </HoloSurface>

          <HoloSurface delay={0.12}>
            <Card className="border-cyan-400/28 shadow-md shadow-black/40">
            <p className="text-[10px] uppercase text-slate-500">Marine / routing</p>
            <p className="mt-2 text-xs text-slate-300">
              Waves {String(snapshot?.maritime_conditions?.wave_height_m ?? "—")} m · Swell{" "}
              {String(snapshot?.maritime_conditions?.wind_wave_m ?? "—")} m · {String(snapshot?.maritime_conditions?.source ?? "")}
            </p>
            </Card>
          </HoloSurface>

          <HoloSurface delay={0.14}>
            <Card className="border-cyan-400/28 shadow-md shadow-black/40">
            <p className="text-[10px] uppercase text-slate-500">Alert net</p>
            <div className="mt-2 max-h-[320px] space-y-2 overflow-y-auto pr-1">
              {(snapshot?.alerts ?? []).map((alert) => (
                <motion.article
                  key={alert.uuid}
                  layout
                  className="rounded border border-slate-800 bg-slate-950/80 p-2 text-[11px] shadow-inner shadow-cyan-900/20"
                >
                  <div className="flex justify-between gap-2 font-semibold text-white">
                    <span>{alert.title}</span>
                    <span className="text-cyan-300">{alert.severity_score.toFixed(0)}</span>
                  </div>
                  <p className="mt-1 text-slate-400">{alert.body}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {alert.predictive ? <Badge label="Predictive" variant="cool" /> : null}
                    <Button type="button" variant="ghost" className="px-2 py-0.5 text-[10px]" onClick={() => emit("alert_ack", { uuid: alert.uuid })}>
                      ACK
                    </Button>
                    <Button type="button" variant="ghost" className="px-2 py-0.5 text-[10px]" onClick={() => emit("alert_clear", { uuid: alert.uuid })}>
                      Clear
                    </Button>
                  </div>
                </motion.article>
              ))}
            </div>
            </Card>
          </HoloSurface>

          <HoloSurface delay={0.18}>
            <Card className="border-violet-400/35 bg-violet-950/[0.08] shadow-lg shadow-violet-950/25">
            <p className="text-[10px] uppercase tracking-[0.25em] text-violet-200/85">AI fleet advisor</p>
            <div className="mt-2 space-y-2 text-[11px]">
              {(snapshot?.advisor ?? []).length === 0 ? <p className="text-slate-500">Cycle ≈120s …</p> : null}
              {(snapshot?.advisor ?? []).map((adv) => (
                <div key={`${adv.uuid}`} className="rounded border border-violet-500/25 bg-black/50 p-2">
                  <p className="font-semibold text-white">{adv.title as string}</p>
                  <p className="mt-1 text-slate-400">{adv.rationale as string}</p>
                  <div className="mt-2 flex gap-2">
                    <Button type="button" variant="neon" className="px-2 py-0.5 text-[10px]" onClick={() => emit("advisor_feedback", { uuid: adv.uuid, status: "accepted" })}>
                      Accept
                    </Button>
                    <Button type="button" variant="ghost" className="px-2 py-0.5 text-[10px]" onClick={() => emit("advisor_feedback", { uuid: adv.uuid, status: "rejected" })}>
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            </Card>
          </HoloSurface>
        </div>
      </div>
    </OperationalBackdrop>
  );
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
      {label}
    </span>
  );
}

function GridStat({ ship }: { ship: FleetShip }) {
  return (
    <div className="grid grid-cols-2 gap-2 text-[11px]">
      <div className="rounded border border-white/10 bg-black/35 p-2">
        <p className="text-[9px] uppercase text-slate-500">SPD / HDG</p>
        <p>
          {ship.speed} kn · {Math.round(ship.heading)}°
        </p>
      </div>
      <div className="rounded border border-white/10 bg-black/35 p-2">
        <p className="text-[9px] uppercase text-slate-500">Fuel / WX</p>
        <p>
          {ship.fuel} t · ×{ship.weather_multiplier ?? 1}
        </p>
      </div>
      <div className="rounded border border-white/10 bg-black/35 p-2">
        <p className="text-[9px] uppercase text-slate-500">Dest</p>
        <p>{ship.destination}</p>
      </div>
      <div className="rounded border border-white/10 bg-black/35 p-2">
        <p className="text-[9px] uppercase text-slate-500">ETA</p>
        <p>{ship.eta_minutes ? `${Math.round(ship.eta_minutes)} min` : "—"}</p>
      </div>
    </div>
  );
}
