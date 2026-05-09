export type LatLng = [number, number];

export type FleetShip = {
  shipId: string;
  name: string;
  position: LatLng;
  speed: number;
  heading: number;
  destination: string;
  fuel: number;
  cargo: string;
  status: string;
  route: LatLng[];
  eta_minutes: number | null;
  holding?: boolean;
  adverse_weather?: boolean;
  weather_multiplier?: number;
  selected_route_profile?: string;
  route_options?: Record<
    string,
    {
      profile: string;
      nodes: LatLng[];
      distance_nm: number;
    }
  >;
  directive_pending?: string | null;
};

export type FleetAlert = {
  uuid: string;
  kind: string;
  severity_score: number;
  ship_id?: string | null;
  secondary_ship_id?: string | null;
  zone_uuid?: string | null;
  title: string;
  body: string;
  acknowledged: boolean;
  cleared: boolean;
  predictive?: boolean;
};

export type FleetSnapshot = {
  server_time: number;
  ships: FleetShip[];
  zones: { uuid: string; name: string; coordinates: LatLng[] }[];
  alerts: FleetAlert[];
  directives: Array<{
    uuid: string;
    ship_id: string;
    type: string;
    payload: Record<string, unknown>;
    status: string;
    captain_response?: string | null;
  }>;
  maritime_conditions: Record<string, unknown>;
  ports: Array<{ id: string; name: string; position: LatLng }>;
  navigableWater: LatLng[];
  boundingBox: { north: number; south: number; east: number; west: number };
  scenario: { name: string; description?: string };
  assistance?: Array<Record<string, unknown>>;
  advisor?: Array<Record<string, unknown>>;
  view_role?: "command" | "captain";
  fleet_contact_count?: number;
  reason?: string;
};
