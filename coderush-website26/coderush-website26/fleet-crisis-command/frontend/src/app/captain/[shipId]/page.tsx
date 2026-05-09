"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";

import { AlertAudio } from "@/components/alerts/AlertAudio";
import { HoloSurface, OperationalBackdrop } from "@/components/scene/OperationalBackdrop";
import { Badge, Card } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useFleetSocket } from "@/hooks/useFleetSocket";
import { useInterpolatedFleet } from "@/hooks/useInterpolatedFleet";
import type { FleetSnapshot } from "@/lib/types";

const FleetMap = dynamic(() => import("@/components/map/FleetMap").then((m) => m.FleetMap), { ssr: false });

export default function CaptainPage() {
  const params = useParams<{ shipId: string }>();
  const shipId = decodeURIComponent(params.shipId);
  const { emit, snapshot, connected, socketRef } = useFleetSocket({ role: "captain", shipId });
  const { ships } = useInterpolatedFleet(snapshot);

  const [escalateNote, setEscalateNote] = useState("");
  const [distressBody, setDistressBody] = useState("");
  const [issueChatInput, setIssueChatInput] = useState("");
  const [issueChatBusy, setIssueChatBusy] = useState(false);
  const [issueChatTurns, setIssueChatTurns] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);

  useEffect(() => {
    const s = socketRef.current;
    if (!s) return;
    function onCaptainChatResult(payload: { ok?: boolean; reply?: string; error?: string }) {
      setIssueChatBusy(false);
      if (payload?.ok) {
        const reply = typeof payload.reply === "string" && payload.reply.trim() ? payload.reply : "(no reply)";
        setIssueChatTurns((prev) => [...prev, { role: "assistant", content: reply }]);
      } else {
        const err =
          typeof payload?.error === "string" ? payload.error : "Chat request failed.";
        setIssueChatTurns((prev) => [...prev, { role: "assistant", content: `Error: ${err}` }]);
      }
    }
    s.on("captain_chat_result", onCaptainChatResult);
    return () => {
      s.off("captain_chat_result", onCaptainChatResult);
    };
  }, [socketRef]);

  const mapSnapshot: FleetSnapshot | null = useMemo(() => {
    if (!snapshot) return null;
    return { ...snapshot, ships };
  }, [snapshot, ships]);

  const pendingDirective = snapshot?.directives.find((d) => d.ship_id === shipId && d.status === "pending");
  const alertIds = useMemo(() => snapshot?.alerts.filter((a) => !a.acknowledged).map((a) => a.uuid) ?? [], [snapshot]);

  const assistInbound = useMemo(
    () =>
      (snapshot?.assistance ?? []).filter(
        (a) => String(a.target_ship_id) === shipId && String(a.status) === "pending",
      ),
    [snapshot, shipId],
  );

  const myHull = ships[0];

  return (
    <OperationalBackdrop variant="captain">
      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="border-b border-amber-500/30 bg-black/62 shadow-[inset_0_-1px_0_rgba(251,191,36,0.12),0_10px_50px_rgba(0,0,0,0.5)] backdrop-blur-2xl"
      >
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.42em] text-amber-300/85">Captain · segregated datalink</p>
            <h1 className="text-2xl font-semibold text-amber-100 md:text-3xl">{myHull?.name ?? shipId}</h1>
            <p className="max-w-xl text-xs text-amber-200/65">
              You receive <strong>hull-local</strong> state only — no fleet-wide tracks. Zones and weather are replicated for situational integrity.
              {snapshot?.fleet_contact_count != null ? (
                <> Command SOC holds omniscience over {snapshot.fleet_contact_count} contacts.</>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={connected ? "cool" : "danger"} label={connected ? "UPLINK" : "LOS"} />
            <Link href="/" className="rounded border border-amber-500/40 px-3 py-1 text-[11px] text-amber-200 hover:bg-amber-500/15">
              Exit to portal
            </Link>
          </div>
        </div>
      </motion.header>

      <div className="mx-auto max-w-[1600px] space-y-4 p-6 [perspective:1800px]">
        <AlertAudio alertIds={alertIds} />

        {!myHull ? (
          <Card className="border border-red-500/50 bg-red-950/40 text-red-100">
            <p className="text-sm font-semibold">Hull {shipId} not in net or invalid ID.</p>
            <p className="mt-2 text-xs text-red-200/80">Pick a valid hull from the landing portal (MV-1 … MV-15).</p>
          </Card>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[2.2fr_minmax(320px,_1fr)]">
          <HoloSurface hoverable={false} delay={0.08}>
            <Card className="overflow-hidden border border-amber-500/38 p-0 shadow-[0_24px_60px_rgba(251,191,72,0.14)]">
            <div className="border-b border-amber-600/25 bg-black/35 px-4 py-2 text-[11px] uppercase tracking-[0.25em] text-amber-300/80">
              Bridge radar · single-ship picture
            </div>
            <FleetMap
              snapshot={mapSnapshot}
              ships={ships}
              highlightId={shipId}
              onPickShip={() => undefined}
              canDrawZones={false}
              mode="captain"
            />
            </Card>
          </HoloSurface>

          <div className="space-y-4">
            {myHull ? (
              <HoloSurface delay={0.06}>
                <Card className="border border-amber-500/28 bg-black/38 shadow-lg shadow-black/40">
                <p className="text-[10px] uppercase tracking-[0.3em] text-amber-400/80">Own-ship tabular</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                  <Stat k="Speed" v={`${myHull.speed} kn`} />
                  <Stat k="Heading" v={`${Math.round(myHull.heading)}° T`} />
                  <Stat k="Fuel" v={`${myHull.fuel} t`} />
                  <Stat k="WX mult" v={`${myHull.weather_multiplier ?? 1}`} />
                  <Stat k="Dest" v={myHull.destination} />
                  <Stat k="ETA" v={myHull.eta_minutes ? `${Math.round(myHull.eta_minutes)} m` : "—"} />
                </div>
              </Card>
              </HoloSurface>
            ) : null}

            <HoloSurface delay={0.1}>
              <Card className="border border-amber-500/25 shadow-md shadow-black/35">
              <p className="text-xs uppercase tracking-[0.28em] text-amber-300/80">Fleet directive</p>
              {pendingDirective ? (
                <div className="mt-3 space-y-3 text-xs">
                  <Badge label={pendingDirective.type} variant="warn" />
                  <pre className="max-h-36 overflow-auto rounded border border-amber-900/40 bg-black/60 p-2 text-[10px] text-amber-100/90">
                    {JSON.stringify(pendingDirective.payload, null, 2)}
                  </pre>
                  <textarea
                    className="w-full rounded border border-amber-800/60 bg-black/50 p-2 text-xs text-amber-50"
                    rows={3}
                    placeholder="Notes if escalating (Groq parses this payload)…"
                    value={escalateNote}
                    onChange={(ev) => setEscalateNote(ev.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="neon"
                      className="flex-1 border-amber-500/70 bg-amber-500/15 text-xs text-amber-100"
                      onClick={() =>
                        emit("captain_response", { directive_uuid: pendingDirective.uuid, response: "ACCEPT", ship_id: shipId })
                      }
                    >
                      Accept course
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="flex-1 text-xs text-amber-100"
                      onClick={() =>
                        emit("captain_response", {
                          directive_uuid: pendingDirective.uuid,
                          response: "ESCALATE_DISTRESS",
                          ship_id: shipId,
                          note: escalateNote,
                        })
                      }
                    >
                      Escalate
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-xs text-amber-200/55">No standing orders.</p>
              )}
            </Card>
            </HoloSurface>

            {assistInbound.length ? (
              <HoloSurface delay={0.12}>
                <Card className="border border-emerald-500/38 bg-emerald-950/18 shadow-lg shadow-emerald-950/20">
                <p className="text-xs uppercase tracking-[0.28em] text-emerald-200/90">Assist request (you = benefactor)</p>
                {assistInbound.map((a) => (
                  <div key={String(a.uuid)} className="mt-3 rounded border border-emerald-500/30 p-3 text-[11px]">
                    <p>
                      From <strong>{String(a.requesting_ship_id)}</strong> · {String(a.aid_type)}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Button
                        type="button"
                        className="flex-1 text-xs"
                        variant="neon"
                        onClick={() => emit("assistance_resolve", { uuid: a.uuid, status: "accepted" })}
                      >
                        Accept
                      </Button>
                      <Button
                        type="button"
                        className="flex-1 text-xs"
                        variant="ghost"
                        onClick={() => emit("assistance_resolve", { uuid: a.uuid, status: "declined" })}
                      >
                        Decline
                      </Button>
                    </div>
                  </div>
                ))}
                </Card>
              </HoloSurface>
            ) : null}

            <HoloSurface delay={0.13}>
              <Card className="border border-violet-500/35 bg-violet-950/15 shadow-lg shadow-violet-950/25">
              <p className="text-xs uppercase tracking-[0.28em] text-violet-200/90">Issue advisor (OpenAI)</p>
              <p className="mt-1 text-[10px] text-violet-200/65">
                Ask about your hull-local alerts, directives, and assistance threads. Responses use live datalink context and require{" "}
                <code className="rounded bg-black/35 px-1 text-[9px]">OPENAI_API_KEY</code> on the backend.
              </p>
              <div className="mt-3 max-h-48 space-y-2 overflow-y-auto rounded border border-violet-500/25 bg-black/45 p-2 text-[11px] leading-relaxed">
                {issueChatTurns.length === 0 ? (
                  <p className="text-violet-200/50">Try: “Summarize active issues for my bridge.”</p>
                ) : (
                  issueChatTurns.map((turn, idx) => (
                    <div
                      key={`${idx}-${turn.role}-${turn.content.slice(0, 12)}`}
                      className={turn.role === "user" ? "text-right text-amber-100/90" : "text-left text-violet-100/90"}
                    >
                      <span className="mr-2 text-[9px] uppercase tracking-wider text-white/35">
                        {turn.role === "user" ? "You" : "Advisor"}
                      </span>
                      <span className="whitespace-pre-wrap">{turn.content}</span>
                    </div>
                  ))
                )}
              </div>
              <textarea
                className="mt-2 w-full rounded border border-violet-500/40 bg-black/55 p-2 text-[11px] text-amber-50"
                rows={3}
                placeholder="Ask about current issues…"
                value={issueChatInput}
                disabled={issueChatBusy}
                onChange={(ev) => setIssueChatInput(ev.target.value)}
              />
              <div className="mt-2 flex gap-2">
                <Button
                  type="button"
                  variant="neon"
                  disabled={issueChatBusy || !issueChatInput.trim()}
                  className="flex-1 border-violet-400/55 bg-violet-500/20 text-xs"
                  onClick={() => {
                    const q = issueChatInput.trim();
                    if (!q) return;
                    setIssueChatBusy(true);
                    const historyForServer = issueChatTurns;
                    setIssueChatTurns((prev) => [...prev, { role: "user", content: q }]);
                    setIssueChatInput("");
                    emit("captain_issue_chat", { message: q, history: historyForServer });
                  }}
                >
                  {issueChatBusy ? "Thinking…" : "Send"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="text-xs text-violet-200"
                  disabled={issueChatBusy}
                  onClick={() => {
                    setIssueChatTurns([]);
                  }}
                >
                  Clear
                </Button>
              </div>
              </Card>
            </HoloSurface>

            <HoloSurface delay={0.14}>
              <Card className="border border-rose-500/40 bg-red-950/18 shadow-xl shadow-red-950/25">
              <p className="text-xs uppercase tracking-[0.28em] text-red-300/90">Distress bulletin (NLP triage)</p>
              <textarea
                className="mt-2 w-full rounded border border-red-500/45 bg-black/55 p-2 text-[11px] text-amber-50"
                rows={4}
                placeholder="Freeform MAYDAY / situation report…"
                value={distressBody}
                onChange={(ev) => setDistressBody(ev.target.value)}
              />
              <Button
                type="button"
                variant="neon"
                className="mt-3 w-full border-red-400/70 bg-red-500/25 text-xs"
                onClick={() => emit("distress_message", { ship_id: shipId, text: distressBody || "Bridge distress bulletin" })}
              >
                Transmit
              </Button>
            </Card>
            </HoloSurface>
          </div>
        </div>
      </div>
    </OperationalBackdrop>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded border border-amber-900/35 bg-black/45 px-2 py-1.5">
      <p className="text-[9px] uppercase tracking-widest text-amber-400/65">{k}</p>
      <p className="text-sm font-medium text-amber-50">{v}</p>
    </div>
  );
}
