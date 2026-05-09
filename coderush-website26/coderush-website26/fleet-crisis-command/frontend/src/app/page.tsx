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
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&family=Exo+2:wght@300;400;500;600&display=swap');

        .portal-font { font-family: 'Rajdhani', sans-serif; }
        .mono-font   { font-family: 'Share Tech Mono', monospace; }
        .body-font   { font-family: 'Exo 2', sans-serif; }

        .card-command {
          background: linear-gradient(135deg, rgba(0,255,200,0.04) 0%, rgba(2,8,24,0.95) 60%);
          border: 1px solid rgba(0,255,200,0.18);
          border-radius: 8px;
          transition: all 0.25s ease;
        }
        .card-command:hover {
          border-color: rgba(0,255,200,0.45);
          box-shadow: 0 0 60px rgba(0,255,200,0.1), 0 24px 60px rgba(0,0,0,0.6);
          transform: translateY(-4px);
        }
        .card-captain {
          background: linear-gradient(135deg, rgba(251,191,36,0.04) 0%, rgba(10,6,0,0.95) 60%);
          border: 1px solid rgba(251,191,36,0.18);
          border-radius: 8px;
          transition: all 0.25s ease;
        }
        .card-captain:hover {
          border-color: rgba(251,191,36,0.45);
          box-shadow: 0 0 60px rgba(251,191,36,0.08), 0 24px 60px rgba(0,0,0,0.6);
          transform: translateY(-4px);
        }
        .btn-command {
          font-family: 'Rajdhani', sans-serif;
          font-weight: 700;
          font-size: 14px;
          letter-spacing: 0.12em;
          display: block;
          width: 100%;
          padding: 13px 20px;
          text-align: center;
          border-radius: 4px;
          border: 1px solid rgba(0,255,200,0.5);
          background: rgba(0,255,200,0.08);
          color: rgba(0,255,200,0.95);
          text-decoration: none;
          transition: all 0.18s ease;
        }
        .btn-command:hover {
          background: rgba(0,255,200,0.16);
          border-color: rgba(0,255,200,0.8);
          color: #fff;
          box-shadow: 0 0 30px rgba(0,255,200,0.15);
        }
        .btn-captain {
          font-family: 'Rajdhani', sans-serif;
          font-weight: 700;
          font-size: 14px;
          letter-spacing: 0.12em;
          display: block;
          width: 100%;
          padding: 13px 20px;
          text-align: center;
          border-radius: 4px;
          border: 1px solid rgba(251,191,36,0.5);
          background: rgba(251,191,36,0.08);
          color: rgba(251,191,36,0.95);
          text-decoration: none;
          transition: all 0.18s ease;
          cursor: pointer;
        }
        .btn-captain:hover {
          background: rgba(251,191,36,0.16);
          border-color: rgba(251,191,36,0.8);
          color: #fff;
          box-shadow: 0 0 30px rgba(251,191,36,0.1);
        }
        .hull-select {
          font-family: 'Share Tech Mono', monospace;
          font-size: 13px;
          width: 100%;
          padding: 10px 12px;
          border-radius: 4px;
          border: 1px solid rgba(251,191,36,0.2);
          background: rgba(0,0,0,0.6);
          color: #fef3c7;
          margin-bottom: 12px;
          cursor: pointer;
        }
        .hull-select:focus { outline: none; border-color: rgba(251,191,36,0.5); }

        .divider-h {
          height: 1px;
          background: linear-gradient(to right, transparent, rgba(255,255,255,0.08), transparent);
          margin: 24px 0;
        }
        .feature-tag {
          font-family: 'Share Tech Mono', monospace;
          font-size: 9px;
          letter-spacing: 0.2em;
          padding: 3px 8px;
          border-radius: 2px;
          display: inline-block;
          margin: 2px;
        }
        .tag-cyan  { background: rgba(0,255,200,0.08); border: 1px solid rgba(0,255,200,0.2); color: rgba(0,255,200,0.7); }
        .tag-amber { background: rgba(251,191,36,0.08); border: 1px solid rgba(251,191,36,0.2); color: rgba(251,191,36,0.7); }

        .stat-bar {
          display: flex; align-items: center; gap: 10px;
          padding: 8px 0;
          border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        .stat-bar:last-child { border-bottom: none; }

        .hex-bg {
          position: absolute;
          width: 500px; height: 500px;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='48'%3E%3Cpolygon points='28,2 54,16 54,32 28,46 2,32 2,16' fill='none' stroke='rgba(0,255,200,0.04)' stroke-width='1'/%3E%3C/svg%3E");
          background-size: 56px 48px;
          opacity: 0.6;
          pointer-events: none;
        }

        @keyframes radar-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes blink-dot {
          0%, 100% { opacity: 1; } 50% { opacity: 0.3; }
        }
      `}</style>

      <main style={{ minHeight: "100vh", position: "relative", overflow: "hidden" }}>

        {/* Hex pattern backgrounds */}
        <div className="hex-bg" style={{ top: -80, right: -80, opacity: 0.4 }} />
        <div className="hex-bg" style={{ bottom: -120, left: -120, opacity: 0.3 }} />

        {/* Radar circle decoration */}
        <div style={{ position: "absolute", top: "10%", right: "8%", width: 280, height: 280, opacity: 0.12, pointerEvents: "none" }}>
          <svg viewBox="0 0 280 280" fill="none" style={{ width: "100%", height: "100%" }}>
            <circle cx="140" cy="140" r="130" stroke="rgba(0,255,200,0.6)" strokeWidth="0.5" />
            <circle cx="140" cy="140" r="90"  stroke="rgba(0,255,200,0.6)" strokeWidth="0.5" />
            <circle cx="140" cy="140" r="50"  stroke="rgba(0,255,200,0.6)" strokeWidth="0.5" />
            <line x1="140" y1="10" x2="140" y2="270" stroke="rgba(0,255,200,0.3)" strokeWidth="0.5" />
            <line x1="10"  y1="140" x2="270" y2="140" stroke="rgba(0,255,200,0.3)" strokeWidth="0.5" />
            <g style={{ transformOrigin: "140px 140px", animation: "radar-spin 6s linear infinite" }}>
              <path d="M140 140 L140 10" stroke="rgba(0,255,200,0.9)" strokeWidth="1" />
              <path d="M140 140 L200 50" stroke="rgba(0,255,200,0.3)" strokeWidth="1" />
            </g>
            <circle cx="185" cy="95" r="4" fill="rgba(0,255,200,0.8)" style={{ animation: "blink-dot 2s ease-in-out infinite" }} />
            <circle cx="110" cy="160" r="3" fill="rgba(251,191,36,0.8)" style={{ animation: "blink-dot 2.5s ease-in-out infinite" }} />
          </svg>
        </div>

        <div style={{ position: "relative", zIndex: 10, maxWidth: 1100, margin: "0 auto", padding: "60px 24px 40px" }}>

          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            style={{ textAlign: "center", marginBottom: 56 }}
          >
            {/* Logo */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
              <svg viewBox="0 0 64 64" fill="none" style={{ width: 64, height: 64 }}>
                <polygon points="32,4 60,20 60,44 32,60 4,44 4,20" stroke="rgba(0,255,200,0.5)" strokeWidth="1.5" fill="rgba(0,255,200,0.04)" />
                <polygon points="32,14 50,24 50,40 32,50 14,40 14,24" stroke="rgba(0,255,200,0.25)" strokeWidth="1" fill="none" />
                <circle cx="32" cy="32" r="5" fill="rgba(0,255,200,0.8)" />
                <line x1="32" y1="18" x2="32" y2="4"  stroke="rgba(0,255,200,0.5)" strokeWidth="1" />
                <line x1="32" y1="60" x2="32" y2="46" stroke="rgba(0,255,200,0.5)" strokeWidth="1" />
              </svg>
            </div>

            <p className="mono-font" style={{ fontSize: 10, letterSpacing: "0.5em", color: "rgba(0,255,200,0.45)", textTransform: "uppercase", marginBottom: 12 }}>
              Fleet Crisis Command · Strait of Hormuz
            </p>
            <h1 className="portal-font" style={{ fontSize: "clamp(36px, 6vw, 64px)", fontWeight: 700, color: "#fff", lineHeight: 1.05, marginBottom: 16 }}>
              HORMUZ SOC<br />
              <span style={{ color: "rgba(0,255,200,0.85)" }}>BRIDGE INGRESS</span>
            </h1>
            <p className="body-font" style={{ fontSize: 14, color: "rgba(148,163,184,0.75)", maxWidth: 480, margin: "0 auto", lineHeight: 1.7 }}>
              Step into omniscient fleet command or a segregated captain datalink. Real-time telemetry, AI routing, and live threat alerts.
            </p>

            {/* Live indicator */}
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 20, background: "rgba(0,0,0,0.4)", border: "1px solid rgba(0,255,200,0.15)", borderRadius: 4, padding: "6px 14px" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#00ffc8", animation: "blink-dot 1.5s ease-in-out infinite" }} />
              <span className="mono-font" style={{ fontSize: 10, color: "rgba(0,255,200,0.7)", letterSpacing: "0.2em" }}>SYSTEM ONLINE · 15 HULLS TRACKED</span>
            </div>
          </motion.div>

          {/* Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24, marginBottom: 40 }}>

            {/* Command card */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.5 }}
              className="card-command"
              style={{ padding: 32 }}
            >
              {/* Card header */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
                <div>
                  <p className="mono-font" style={{ fontSize: 9, letterSpacing: "0.35em", color: "rgba(0,255,200,0.5)", textTransform: "uppercase", marginBottom: 6 }}>SOC · Red Cell</p>
                  <h2 className="portal-font" style={{ fontSize: 30, fontWeight: 700, color: "#fff" }}>Central Command</h2>
                </div>
                <svg viewBox="0 0 40 40" fill="none" style={{ width: 40, height: 40, flexShrink: 0 }}>
                  <polygon points="20,2 38,11 38,29 20,38 2,29 2,11" stroke="rgba(0,255,200,0.4)" strokeWidth="1" fill="rgba(0,255,200,0.05)" />
                  <circle cx="20" cy="20" r="4" fill="rgba(0,255,200,0.7)" />
                  <circle cx="12" cy="14" r="2" fill="rgba(0,255,200,0.4)" />
                  <circle cx="28" cy="26" r="2" fill="rgba(0,255,200,0.4)" />
                  <line x1="14" y1="16" x2="18" y2="18" stroke="rgba(0,255,200,0.3)" strokeWidth="0.8" />
                  <line x1="22" y1="22" x2="26" y2="24" stroke="rgba(0,255,200,0.3)" strokeWidth="0.8" />
                </svg>
              </div>

              <p className="body-font" style={{ fontSize: 13, color: "rgba(148,163,184,0.7)", lineHeight: 1.7, marginBottom: 20 }}>
                Shared operating picture with omniscient fleet tracking, zone authoring, multi-route overlays, predictive alerts, and AI advisor arbitration.
              </p>

              <div style={{ marginBottom: 24, display: "flex", flexWrap: "wrap", gap: 4 }}>
                {["Full COP", "Zone Control", "AI Advisor", "Route Matrix", "Alert Net", "Playback"].map(t => (
                  <span key={t} className="feature-tag tag-cyan">{t}</span>
                ))}
              </div>

              <div className="divider-h" style={{ margin: "20px 0" }} />

              <div style={{ marginBottom: 24 }}>
                {[
                  { k: "Fleet contacts", v: "15 hulls" },
                  { k: "Coverage", v: "Strait of Hormuz" },
                  { k: "Access level", v: "OMNISCIENT" },
                ].map(({ k, v }) => (
                  <div key={k} className="stat-bar">
                    <span className="mono-font" style={{ fontSize: 10, color: "rgba(148,163,184,0.4)", minWidth: 120 }}>{k}</span>
                    <span className="mono-font" style={{ fontSize: 11, color: "rgba(0,255,200,0.8)" }}>{v}</span>
                  </div>
                ))}
              </div>

              <Link href="/command" className="btn-command">
                LAUNCH COMMAND COP →
              </Link>
              <p className="mono-font" style={{ fontSize: 9, textAlign: "center", color: "rgba(148,163,184,0.3)", marginTop: 10, letterSpacing: "0.15em" }}>
                DEDICATED MESH · FULL COP
              </p>
            </motion.div>

            {/* Captain card */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.5 }}
              className="card-captain"
              style={{ padding: 32 }}
            >
              {/* Card header */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
                <div>
                  <p className="mono-font" style={{ fontSize: 9, letterSpacing: "0.35em", color: "rgba(251,191,36,0.5)", textTransform: "uppercase", marginBottom: 6 }}>Captain · Bridge</p>
                  <h2 className="portal-font" style={{ fontSize: 30, fontWeight: 700, color: "#fef3c7" }}>Hull-Local Picture</h2>
                </div>
                <svg viewBox="0 0 40 40" fill="none" style={{ width: 40, height: 40, flexShrink: 0 }}>
                  <polygon points="20,3 36,12 36,28 20,37 4,28 4,12" stroke="rgba(251,191,36,0.4)" strokeWidth="1" fill="rgba(251,191,36,0.04)" />
                  <path d="M20 10 L24 20 L20 30 L16 20 Z" fill="rgba(251,191,36,0.7)" />
                </svg>
              </div>

              <p className="body-font" style={{ fontSize: 13, color: "rgba(254,243,199,0.55)", lineHeight: 1.7, marginBottom: 20 }}>
                Filtered datalink: your hull only, correlated alerts, fleet directives, and inbound assist cues — isolated from foreign tracks for operational security.
              </p>

              <div style={{ marginBottom: 24, display: "flex", flexWrap: "wrap", gap: 4 }}>
                {["Hull Telemetry", "Directives", "AI Advisor", "Distress NLP", "Assist Net"].map(t => (
                  <span key={t} className="feature-tag tag-amber">{t}</span>
                ))}
              </div>

              <div className="divider-h" style={{ margin: "20px 0", background: "linear-gradient(to right, transparent, rgba(251,191,36,0.15), transparent)" }} />

              <div style={{ marginBottom: 16 }}>
                {[
                  { k: "Data scope",    v: "Hull-local only" },
                  { k: "Mesh type",    v: "Segregated" },
                  { k: "Access level", v: "CAPTAIN" },
                ].map(({ k, v }) => (
                  <div key={k} className="stat-bar">
                    <span className="mono-font" style={{ fontSize: 10, color: "rgba(254,243,199,0.3)", minWidth: 120 }}>{k}</span>
                    <span className="mono-font" style={{ fontSize: 11, color: "rgba(251,191,36,0.8)" }}>{v}</span>
                  </div>
                ))}
              </div>

              <div style={{ marginBottom: 12 }}>
                <label className="mono-font" style={{ fontSize: 9, letterSpacing: "0.3em", color: "rgba(251,191,36,0.5)", display: "block", marginBottom: 6 }}>
                  SELECT HULL ID
                </label>
                <select className="hull-select" value={hull} onChange={(e) => setHull(e.target.value)}>
                  {HULLS.map((id) => (
                    <option key={id} value={id}>{id}</option>
                  ))}
                </select>
              </div>

              <Link href={captainHref} className="btn-captain">
                ENTER BRIDGE · {hull} →
              </Link>
              <p className="mono-font" style={{ fontSize: 9, textAlign: "center", color: "rgba(251,191,36,0.25)", marginTop: 10, letterSpacing: "0.15em" }}>
                CAPTAIN ROLE · SEGREGATED MESH
              </p>
            </motion.div>
          </div>

          {/* Bottom status bar */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.5 }}
            style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 32, flexWrap: "wrap" }}
          >
            {[
              { label: "Scenario", value: "Hormuz Strait Crisis" },
              { label: "Fleet Size", value: "15 Hulls" },
              { label: "AI Stack", value: "GPT-4o-mini / Llama-3.3" },
              { label: "Tick Rate", value: "Real-time WebSocket" },
            ].map(({ label, value }) => (
              <div key={label} style={{ textAlign: "center" }}>
                <p className="mono-font" style={{ fontSize: 8, color: "rgba(148,163,184,0.35)", letterSpacing: "0.25em", marginBottom: 3 }}>{label.toUpperCase()}</p>
                <p className="body-font" style={{ fontSize: 12, color: "rgba(148,163,184,0.6)" }}>{value}</p>
              </div>
            ))}
          </motion.div>

          <p className="mono-font" style={{ textAlign: "center", fontSize: 9, color: "rgba(148,163,184,0.2)", marginTop: 32, letterSpacing: "0.2em" }}>
            LOCAL: docker compose up · PRODUCTION: Railway + Vercel
          </p>
        </div>
      </main>
    </OperationalBackdrop>
  );
}