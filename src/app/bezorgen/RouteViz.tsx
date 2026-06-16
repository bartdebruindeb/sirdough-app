"use client";
import { useRef, useEffect } from "react";

export type MapRow = {
  customerId: string;
  name: string;
  city: string;
  address: string;
  lat: number | null;
  lng: number | null;
  busIndex: number | null;
  delivered: boolean;
  deliveredAt: string | null;
};

// Bakery: De Weegbreestraat 23a, Rotterdam
const BAKERY_LAT = 51.9097;
const BAKERY_LNG = 4.4328;

const W = 660;
const H = 280;
const PAD = 48; // canvas padding so nodes don't clip edges
const NODE_R = 22;

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  try { return new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

function trunc(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// Project lat/lng to SVG x/y given bounding box
function project(lat: number, lng: number, bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }) {
  const { minLat, maxLat, minLng, maxLng } = bounds;
  const rangeX = maxLng - minLng || 0.01;
  const rangeY = maxLat - minLat || 0.01;
  const x = PAD + ((lng - minLng) / rangeX) * (W - PAD * 2);
  // Lat increases upward on a map, so invert Y
  const y = PAD + ((maxLat - lat) / rangeY) * (H - PAD * 2);
  return { x, y };
}

interface Props { rows: MapRow[]; }

export default function RouteViz({ rows }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const busStops = rows
    .filter(r => r.busIndex !== null)
    .sort((a, b) => (a.busIndex ?? 0) - (b.busIndex ?? 0));

  // Check if we have real coordinates for at least half the bus stops
  const coordCount = busStops.filter(s => s.lat && s.lng).length;
  const useGeo = coordCount > 0;

  // Build all points (bakery + stops + optional end bakery) with coordinates
  type Node = {
    id: string; label: string; sub: string;
    lat: number; lng: number;
    delivered: boolean; deliveredAt: string | null;
    kind: "bakery" | "stop"; num?: number;
  };

  const showEndBakery = busStops.length > 0;
  const allNodes: Node[] = [
    { id: "__start__", label: "Bakkerij", sub: "De Weegbreest. 23a", lat: BAKERY_LAT, lng: BAKERY_LNG, delivered: true, deliveredAt: null, kind: "bakery" },
    ...busStops.map((s, i): Node => ({
      id: s.customerId, label: s.name, sub: s.city,
      // Fall back to linear layout if no coords: spread evenly around Rotterdam
      lat: s.lat ?? (BAKERY_LAT + (i + 1) * 0.015),
      lng: s.lng ?? (BAKERY_LNG + (i + 1) * 0.02),
      delivered: s.delivered, deliveredAt: s.deliveredAt,
      kind: "stop", num: i + 1,
    })),
    ...(showEndBakery ? [{
      id: "__end__", label: "Bakkerij", sub: "Terug",
      lat: BAKERY_LAT, lng: BAKERY_LNG,
      delivered: busStops.every(s => s.delivered), deliveredAt: null, kind: "bakery" as const,
    }] : []),
  ];

  // Compute bounding box of all node coords
  const lats = allNodes.map(n => n.lat);
  const lngs = allNodes.map(n => n.lng);
  const bounds = {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
  };
  // Add 15% padding to bounds so nodes don't crowd edges
  const latPad = (bounds.maxLat - bounds.minLat) * 0.15 || 0.005;
  const lngPad = (bounds.maxLng - bounds.minLng) * 0.15 || 0.005;
  bounds.minLat -= latPad; bounds.maxLat += latPad;
  bounds.minLng -= lngPad; bounds.maxLng += lngPad;

  // Project all nodes to SVG coords
  const pts = allNodes.map(n => project(n.lat, n.lng, bounds));

  // Find active segment
  let lastDoneIdx = 0;
  for (let i = 0; i < allNodes.length; i++) {
    if (allNodes[i].delivered) lastDoneIdx = i;
    else break;
  }
  const nextIdx = lastDoneIdx + 1 < allNodes.length ? lastDoneIdx + 1 : null;
  const allDone = busStops.length > 0 && busStops.every(s => s.delivered);
  const truckActive = nextIdx !== null && !allDone;

  const fromPt = pts[lastDoneIdx] ?? { x: PAD, y: H / 2 };
  const toPt   = nextIdx !== null ? pts[nextIdx] : fromPt;
  const dx = toPt.x - fromPt.x;
  const dy = toPt.y - fromPt.y;

  // Auto-scroll is N/A for geographic canvas (fixed size, no scroll needed)

  const pendingRows = rows.filter(r => r.busIndex === null);
  const missingCoords = busStops.filter(s => !s.lat || !s.lng);

  return (
    <div style={{ background: "var(--surface)", borderRadius: 14, overflow: "hidden", border: "1px solid var(--border)" }}>
      <style>{`
        @keyframes rv-truck {
          0%,100% { transform: translate(0px, 0px); }
          50%      { transform: translate(${dx}px, ${dy}px); }
        }
        @keyframes rv-pulse {
          0%   { r: ${NODE_R + 5}; opacity: .55; }
          100% { r: ${NODE_R + 14}; opacity: 0; }
        }
        @keyframes rv-dash { to { stroke-dashoffset: -24; } }
        .rv-truck { animation: ${truckActive ? "rv-truck 5s ease-in-out infinite" : "none"};
                    transform-box: fill-box; transform-origin: center; }
        .rv-pulse { animation: rv-pulse 1.6s ease-out infinite; }
        .rv-adash { animation: rv-dash .7s linear infinite; }
      `}</style>

      {/* Missing coords notice */}
      {missingCoords.length > 0 && (
        <div style={{ padding: "6px 14px", background: "#fffbeb", borderBottom: "1px solid #fde68a", fontSize: 11, color: "#92400e" }}>
          📍 {missingCoords.length} stop{missingCoords.length > 1 ? "s" : ""} zonder locatie ({missingCoords.map(s => s.name).join(", ")}) — sla locaties op via Klantenbeheer voor exacte posities.
        </div>
      )}

      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
        {/* City grid background */}
        <defs>
          <pattern id="rv-grid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0L0 0 0 40" fill="none" stroke="var(--border)" strokeWidth="0.5" opacity="0.6"/>
          </pattern>
        </defs>
        <rect width={W} height={H} fill="url(#rv-grid)" rx="12"/>

        {/* Faint "Rotterdam" label */}
        <text x={W / 2} y={16} textAnchor="middle" fontSize={11} fill="var(--text-subtle)" opacity="0.4"
          fontFamily="var(--font-body)">Rotterdam</text>

        {/* ── Segment lines ── */}
        {allNodes.map((node, i) => {
          if (i === 0) return null;
          const p1 = pts[i - 1];
          const p2 = pts[i];
          const prevDone = allNodes[i - 1].delivered;
          const thisDone = node.delivered;
          const isActive = i === nextIdx;
          return (
            <line key={`seg-${i}`}
              x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
              stroke={prevDone && thisDone ? "#1D9E75" : isActive ? "#7F77DD" : "var(--border-strong)"}
              strokeWidth={isActive ? 3.5 : prevDone && thisDone ? 3 : 2}
              strokeLinecap="round"
              strokeDasharray={isActive ? "10 5" : !prevDone || !thisDone ? "6 4" : undefined}
              className={isActive ? "rv-adash" : undefined}
              opacity={isActive || (prevDone && thisDone) ? 1 : 0.5}
            />
          );
        })}

        {/* ── Truck ── */}
        <g className="rv-truck" style={{ transformOrigin: `${fromPt.x}px ${fromPt.y - 20}px` }}>
          <rect x={fromPt.x - 16} y={fromPt.y - 36} width={32} height={20} rx={5}
            fill="var(--surface)" stroke="#7F77DD" strokeWidth={1.5}/>
          <text x={fromPt.x} y={fromPt.y - 22} textAnchor="middle" fontSize={15}
            style={{ userSelect: "none" }}>🚐</text>
        </g>

        {/* ── Nodes ── */}
        {allNodes.map((node, i) => {
          const { x, y } = pts[i];
          const isNext  = i === nextIdx;
          const isBake  = node.kind === "bakery";
          const fill    = node.delivered ? (isBake ? "#633806" : "#1D9E75") : isNext ? "#7F77DD" : "#9ca3af";

          // Label placement: avoid overlap with route lines by checking quadrant
          const labelY = y + NODE_R + 14;

          return (
            <g key={node.id}>
              {isNext && (
                <circle className="rv-pulse" cx={x} cy={y} r={NODE_R + 5}
                  fill="none" stroke="#7F77DD" strokeWidth={2}/>
              )}
              {/* Shadow */}
              <circle cx={x + 1} cy={y + 2} r={NODE_R} fill="rgba(0,0,0,.1)"/>
              {/* Circle */}
              <circle cx={x} cy={y} r={NODE_R} fill={fill} stroke="var(--surface)" strokeWidth={2.5}/>
              {/* Icon */}
              {isBake ? (
                <text x={x} y={y + 6} textAnchor="middle" fontSize={15} style={{ userSelect: "none" }}>🏠</text>
              ) : node.delivered ? (
                <text x={x} y={y + 5} textAnchor="middle" fontSize={13} fill="white" fontWeight="800">✓</text>
              ) : (
                <text x={x} y={y + 5} textAnchor="middle" fontSize={12} fill="white" fontWeight="700">{node.num}</text>
              )}
              {/* Name label */}
              <text x={x} y={labelY} textAnchor="middle" fontSize={10}
                fontWeight={isNext ? "700" : "400"}
                fill={isNext ? "#534AB7" : "var(--text)"}
                fontFamily="var(--font-body)">
                {trunc(isBake ? (i === 0 ? "Start" : "Einde") : node.label, 16)}
              </text>
              {/* City */}
              {!isBake && (
                <text x={x} y={labelY + 12} textAnchor="middle" fontSize={9}
                  fill="var(--text-subtle)" fontFamily="var(--font-body)">
                  {trunc(node.sub, 14)}
                </text>
              )}
              {/* Time */}
              {node.deliveredAt && (
                <text x={x} y={labelY + (isBake ? 0 : 24)} textAnchor="middle"
                  fontSize={9} fill="#1D9E75" fontWeight="600" fontFamily="var(--font-body)">
                  ✓ {fmtTime(node.deliveredAt)}
                </text>
              )}
              {isNext && !node.deliveredAt && (
                <text x={x} y={labelY + 24} textAnchor="middle"
                  fontSize={9} fill="#7F77DD" fontWeight="600" fontFamily="var(--font-body)">
                  volgende stop
                </text>
              )}
            </g>
          );
        })}

        {/* Empty state */}
        {busStops.length === 0 && (
          <text x={W / 2} y={H / 2 + 5} textAnchor="middle" fontSize={12}
            fill="var(--text-subtle)" fontFamily="var(--font-body)">
            Voeg stops toe om de route te zien
          </text>
        )}

        {/* All done */}
        {allDone && (
          <text x={W / 2} y={H - 10} textAnchor="middle" fontSize={12}
            fill="#1D9E75" fontWeight="700" fontFamily="var(--font-body)">
            🎉 Alle stops geleverd!
          </text>
        )}
      </svg>

      {/* Pending chips */}
      {pendingRows.length > 0 && (
        <div style={{ padding: "8px 16px 12px", borderTop: "1px solid var(--border)" }}>
          <div style={{ fontSize: 11, color: "var(--text-subtle)", marginBottom: 5 }}>
            Niet ingepland ({pendingRows.length})
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {pendingRows.map(r => (
              <span key={r.customerId} style={{
                fontSize: 11, background: "var(--surface-2)", border: "1px solid var(--border)",
                borderRadius: 12, padding: "3px 10px", color: "var(--text-muted)",
              }}>
                {r.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
