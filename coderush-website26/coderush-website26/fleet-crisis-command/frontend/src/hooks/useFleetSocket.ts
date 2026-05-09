"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

import type { FleetSnapshot } from "@/lib/types";

const DEFAULT_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:5001";

export type CommandToast = { id: number; severity: "info" | "error"; text: string };

export function useFleetSocket(opts: { role: "command" | "captain" | "observer"; shipId?: string }) {
  const url = DEFAULT_URL;
  const [snapshot, setSnapshot] = useState<FleetSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [assistSuggestions, setAssistSuggestions] = useState<Array<Record<string, unknown>>>([]);
  const [commandToasts, setCommandToasts] = useState<CommandToast[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const toastIdRef = useRef(0);

  const pushToast = useCallback((severity: CommandToast["severity"], text: string) => {
    const id = ++toastIdRef.current;
    setCommandToasts((prev) => [...prev, { id, severity, text }]);
    window.setTimeout(() => {
      setCommandToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5200);
  }, []);

  useEffect(() => {
    const socket = io(url, {
      path: "/socket.io",
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 750,
    });

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("session_identify", {
        role: opts.role,
        ship_id: opts.shipId ?? null,
      });
    });

    socket.on("disconnect", () => setConnected(false));

    socket.on("fleet_snapshot", (payload: FleetSnapshot) => {
      setSnapshot(payload);
    });

    socket.on("helper_suggestions_result", (payload: { helpers?: Array<Record<string, unknown>> }) => {
      setAssistSuggestions(payload.helpers ?? []);
    });

    socket.on("command_error", (payload: { message?: string }) => {
      pushToast("error", payload?.message ?? "Command rejected");
    });

    socket.on("route_profiles_result", (payload: { ship_id?: string; profiles?: Record<string, unknown> }) => {
      const count = payload?.profiles ? Object.keys(payload.profiles).length : 0;
      pushToast(
        "info",
        count
          ? `Route matrix refreshed (${count} variants) · ${payload.ship_id ?? "hull"}`
          : `Route matrix returned empty · ${payload.ship_id ?? "hull"}`,
      );
    });

    socket.on("route_select_result", (payload: { ok?: boolean }) => {
      pushToast(payload.ok ? "info" : "error", payload.ok ? "Route profile applied." : "Could not apply that route profile.");
    });

    socket.on("directive_issued", (payload: { uuid?: string; status?: string }) => {
      pushToast(
        "info",
        payload?.uuid
          ? `Directive queued (${String(payload.status ?? "pending")}) · ${payload.uuid.slice(0, 8)}…`
          : "Directive queued.",
      );
    });

    socketRef.current = socket;
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [url, opts.role, opts.shipId, pushToast]);

  const emit = useCallback((event: string, payload?: Record<string, unknown>) => {
    socketRef.current?.emit(event, payload);
  }, []);

  return useMemo(
    () => ({
      emit,
      snapshot,
      connected,
      assistSuggestions,
      commandToasts,
      /** Same Socket.IO instance; use sparingly for role-specific handlers (captain-only chat). */
      socketRef,
    }),
    [emit, snapshot, connected, assistSuggestions, commandToasts],
  );
}
