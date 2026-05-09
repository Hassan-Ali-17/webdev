"use client";

import L from "leaflet";
import { useEffect, useMemo, useRef } from "react";
import { MapContainer, Marker, Polygon, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";

import "leaflet-draw/dist/leaflet.draw.css";
import "leaflet/dist/leaflet.css";

import type { FleetShip, FleetSnapshot, LatLng } from "@/lib/types";

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function shipGlow(status: string) {
  switch (status) {
    case "distressed":
    case "stranded":
    case "insufficient_fuel":
    case "out_of_fuel":
      return "#f87171";
    case "rerouting":
      return "#fbbf24";
    case "stopped":
      return "#a855f7";
    default:
      return "#22d3ee";
  }
}

function MapInvalidateOnResize() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    map.invalidateSize();
    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);
  return null;
}

function FitStrategy({ ships, mode }: { ships: FleetShip[]; mode: "command" | "captain" }) {
  const map = useMap();
  const seeded = useRef(false);
  useEffect(() => {
    if (!ships.length || seeded.current) return;
    seeded.current = true;
    if (mode === "captain") {
      const [lat, lng] = ships[0].position;
      map.setView([lat, lng], 9, { animate: false });
      return;
    }
    try {
      const b = L.latLngBounds(ships.map((s) => s.position));
      if (b.isValid()) map.fitBounds(b.pad(0.12), { animate: false, maxZoom: 10 });
    } catch {
      map.setView([26.4, 55.2], 7, { animate: false });
    }
  }, [map, ships, mode]);

  /** Re-center captain when hull jumps significantly */
  useEffect(() => {
    if (mode !== "captain" || !ships.length) return;
    const [lat, lng] = ships[0].position;
    const ctr = map.getCenter();
    if (ctr.distanceTo(L.latLng(lat, lng)) > 450_000) {
      map.setView([lat, lng], map.getZoom(), { animate: true });
    }
  }, [ships, map, mode]);

  return null;
}

export function FleetMap(props: {
  snapshot: FleetSnapshot | null;
  ships: FleetShip[];
  highlightId?: string;
  onPickShip: (id: string) => void;
  canDrawZones: boolean;
  onZoneCommitted?: (poly: LatLng[]) => void;
  compareRoutes?: Record<string, LatLng[]> | null;
  mode?: "command" | "captain";
}) {
  const mode = props.mode ?? "command";
  const tileUrl =
    process.env.NEXT_PUBLIC_MAP_TILE_URL ??
    "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

  const bounds = useMemo(() => {
    if (!props.snapshot) return L.latLngBounds([22, 47.5], [30.5, 60]);
    const bbox = props.snapshot.boundingBox;
    return L.latLngBounds([bbox.south, bbox.west], [bbox.north, bbox.east]);
  }, [props.snapshot]);

  return (
    <MapContainer bounds={bounds} className="z-0 h-full min-h-[520px] w-full rounded-lg" scrollWheelZoom key={`map-${mode}`}>
      <TileLayer attribution="© OpenStreetMap contributors © Carto" url={tileUrl} />
      <MapInvalidateOnResize />
      <FitStrategy ships={props.ships} mode={mode} />

      {props.snapshot?.navigableWater && props.snapshot.navigableWater.length > 2 ? (
        <Polygon
          positions={props.snapshot.navigableWater}
          pathOptions={{ color: mode === "captain" ? "#fbbf24" : "#22d3ee", weight: 1, dashArray: "6 12", fillOpacity: 0.03 }}
        />
      ) : null}

      {props.snapshot?.zones?.map((z) => (
        <Polygon key={z.uuid} positions={z.coordinates} pathOptions={{ color: "#fb7185", weight: 2, fillOpacity: 0.22 }} />
      ))}

      {props.ships.map((ship) =>
        ship.route && ship.route.length >= 2 ? (
          <Polyline
            key={`${ship.shipId}-route`}
            positions={ship.route}
            pathOptions={{
              color: shipGlow(ship.status),
              weight: mode === "captain" ? 4 : 2,
              opacity: mode === "captain" ? 0.92 : 0.65,
            }}
          />
        ) : null,
      )}

      {props.compareRoutes
        ? Object.entries(props.compareRoutes).map(([key, nodes]) => (
            <Polyline
              key={key}
              positions={nodes}
              pathOptions={{
                color: key.includes("safest") ? "#7dd3fc" : key.includes("fuel") ? "#86efac" : "#fcd34d",
                weight: 3,
                dashArray: key.includes("fuel_efficient") ? "4 14" : key.includes("fastest") ? "2 12" : "1 14",
                opacity: 0.88,
              }}
            />
          ))
        : null}

      <ShipMarkersLayer ships={props.ships} highlightId={props.highlightId} onPickShip={props.onPickShip} mode={mode} />
      {props.canDrawZones && props.onZoneCommitted ? <DrawPolygons onPolygon={props.onZoneCommitted} /> : null}
    </MapContainer>
  );
}

function ShipMarker({
  ship,
  highlightId,
  onPickShip,
  mode,
}: {
  ship: FleetShip;
  highlightId?: string;
  onPickShip: (id: string) => void;
  mode: "command" | "captain";
}) {
  const map = useMap();
  const filtId = ship.shipId.replace(/[^a-zA-Z0-9_]/g, "_");
  const icon = useMemo(() => {
    const glow = shipGlow(ship.status);
    const size = highlightId === ship.shipId ? 42 : mode === "captain" ? 40 : 30;
    const el = document.createElement("div");
    el.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 52 52" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="g_${filtId}"><feGaussianBlur stdDeviation="${
            mode === "captain" ? 2 : 1
          }" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <g transform='translate(26,26)' filter='url(#g_${filtId})'>
          <polygon points='0,-18 16,18 -16,18' transform='rotate(${ship.heading - 180})' stroke='#020617' stroke-width='2' fill='${glow}'/>
        </g>
      </svg>`;
    return L.divIcon({ html: el, iconSize: [size, size], iconAnchor: [size / 2, size / 2], className: "" });
  }, [filtId, ship.heading, ship.status, highlightId === ship.shipId, ship.shipId, mode]);

  return (
    <Marker
      position={ship.position as L.LatLngExpression}
      icon={icon}
      zIndexOffset={highlightId === ship.shipId ? 800 : mode === "captain" ? 700 : 400}
      eventHandlers={{
        click: () => {
          map.flyTo(ship.position as L.LatLngExpression, Math.max(map.getZoom(), mode === "captain" ? 9 : 7), { duration: 0.35 });
          onPickShip(ship.shipId);
        },
      }}
    >
      <Tooltip direction="top" sticky={false} opacity={0.95} className="rounded border border-white/15 bg-slate-900/95 px-2 py-1 text-[11px] text-slate-100">
        <div>
          <strong>{ship.name}</strong>
          <br />
          {ship.shipId} · {ship.status}
          <br />
          {ship.speed.toFixed(0)} kn · {Math.round(ship.heading)}°
        </div>
      </Tooltip>
    </Marker>
  );
}

function ShipMarkersLayer({
  ships,
  highlightId,
  onPickShip,
  mode,
}: {
  ships: FleetShip[];
  highlightId?: string;
  onPickShip: (id: string) => void;
  mode: "command" | "captain";
}) {
  return (
    <>
      {ships.map((ship) => (
        <ShipMarker key={ship.shipId} ship={ship} highlightId={highlightId} onPickShip={onPickShip} mode={mode} />
      ))}
    </>
  );
}

function DrawPolygons({ onPolygon }: { onPolygon: (poly: LatLng[]) => void }) {
  const map = useMap();

  useEffect(() => {
    let disposed = false;
    const group = new L.FeatureGroup().addTo(map);
    let control: L.Control | null = null;

    type CreatedEvent = { layer: L.Layer };

    const handleCreated = (evt: CreatedEvent) => {
      const layer = evt.layer as L.Layer & { toGeoJSON: () => GeoJSON.Feature<GeoJSON.Polygon> };
      if (typeof layer.toGeoJSON !== "function") return;
      group.clearLayers();
      group.addLayer(layer);
      const gj = layer.toGeoJSON() as GeoJSON.Feature<GeoJSON.Polygon>;
      const coords = gj.geometry?.coordinates?.[0];
      if (!coords) return;
      const latlng = coords.slice(0, -1).map(([lng, lat]) => [lat, lng]) as LatLng[];
      if (latlng.length > 2) {
        onPolygon(latlng);
      }
    };

    (async () => {
      await import("leaflet-draw");
      if (disposed) return;
      const LDraw = L as typeof L & { Control: typeof L.Control & { Draw: new (opts?: unknown) => L.Control } };
      control = new LDraw.Control.Draw({
        draw: {
          polygon: {
            allowIntersection: false,
            shapeOptions: { color: "#fb923c", weight: 3, opacity: 0.92 },
          },
          rectangle: false,
          circle: false,
          polyline: false,
          marker: false,
        },
      });
      map.addControl(control);

      map.on("draw:created", handleCreated as L.LeafletEventHandlerFn);
      queueMicrotask(() => map.invalidateSize());
    })();

    return () => {
      disposed = true;
      map.off("draw:created", handleCreated as L.LeafletEventHandlerFn);
      if (control) {
        map.removeControl(control);
      }
      map.removeLayer(group);
    };
  }, [map, onPolygon]);

  return null;
}
