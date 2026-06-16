"use client";
import { useRef, useEffect } from "react";

export type MapRow = {
  customerId: string;
  name: string;
  city: string;
  address: string;
  busIndex: number | null;
  delivered: boolean;
  deliveredAt: string | null;
};

const NODE_GAP = 148;
const LINE_Y   = 82;
const NODE_R   = 24;
const SVG_H    = 210;
const START_X  = 56;

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  try { return new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; }
}

function trunc(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

interface Props { rows: MapRow[]; }

export default function RouteViz({ rows }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const busStops = rows
    .filter(r => r.busIndex !== null)
    .sort((a, b) => (a.busIndex ?? 0) - (b.busIndex ?? 0));

  // Nodes: start bakery → stops → end bakery
  type Node =
    | { kind: "bakery"; id: string; label: string; sub: string; delivered: boolean; deliveredAt: null }
    | { kind: "stop";   id: string; label: string; sub: string; delivered: boolean; deliveredAt: string | null; num: number };

  const nodes: Node[] = [
    { kind: "bakery", id: "__start__", label: "Bakkerij", sub: "De Weegbreest. 23a", delivered: true, deliveredAt: null },
    ...busStops.map((s, i): Node => ({
      kind: "stop", id: s.customerId, label: s.name, sub: s.city,
      delivered: s.delivered, deliveredAt: s.deliveredAt, num: i + 1,
    })),
    ...(busStops.length > 0 ? [{
      kind: "bakery" as const, id: "__end__", label: "Bakkerij", sub: "Terug",
      delivered: busStops.length > 0 && busStops.every(s => s.delivered), deliveredAt: null,
    }] : []),
  ];

  // Find where the driver is: last consecutive completed node
  let lastDoneIdx = 0;
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].delivered) lastDoneIdx = i;
    else break;
  }
  const nextIdx   = lastDoneIdx + 1 < nodes.length ? lastDoneIdx + 1 : null;
  const allDone   = busStops.length > 0 && busStops.every(s => s.delivered);
  const truckActive = nextIdx !== null && !allDone;

  const fromX = START_X + lastDoneIdx * NODE_GAP;
  const toX   = nextIdx !== null ? START_X + nextIdx * NODE_GAP : fromX;

  const totalWidth = Math.max(480, START_X * 2 + (nodes.length - 1) * NODE_GAP);

  // Auto-scroll to active segment
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || nextIdx === null) return;
    const cx = START_X + nextIdx * NODE_GAP;
    el.scrollTo({ left: cx - el.clientWidth / 2 + NODE_R, behavior: "smooth" });
  }, [nextIdx]);

  const pendingRows = rows.filter(r => r.busIndex === null);

  return (
    <div style={{ background: "var(--surface)", borderRadius: 14, overflow: "hidden", border: "1px solid var(--border)" }}>
      <style>{`
        @keyframes rv-truck {
          0%,100% { transform: translateX(0px); }
          50%      { transform: translateX(${toX - fromX}px); }
        }
        @keyframes rv-pulse {
          0%   { r: ${NODE_R + 5}; opacity: .55; }
          100% { r: ${NODE_R + 14}; opacity: 0; }
        }
        @keyframes rv-dash {
          to { stroke-dashoffset: -30; }
        }
        .rv-truck { animation: ${truckActive ? "rv-truck 5s ease-in-out infinite" : "none"};
                    transform-box: fill-box; transform-origin: center; }
        .rv-pulse { animation: rv-pulse 1.6s ease-out infinite; }
        .rv-dash  { animation: rv-dash .7s linear infinite; }
      `}</style>

      <div ref={scrollRef} style={{ overflowX: "auto", overflowY: "hidden", padding: "0 8px" }}>
        <svg width={totalWidth} height={SVG_H} style={{ display: "block", overflow: "visible" }}>

          {/* ── Segment lines ── */}
          {nodes.map((node, i) => {
            if (i === 0) return null;
            const x1 = START_X + (i - 1) * NODE_GAP + NODE_R + 3;
            const x2 = START_X + i * NODE_GAP - NODE_R - 3;
            const prevDone = nodes[i - 1].delivered;
            const thisDone = node.delivered;
            const isActive = i === nextIdx;
            return (
              <line
                key={`seg-${i}`}
                x1={x1} y1={LINE_Y} x2={x2} y2={LINE_Y}
                stroke={prevDone && thisDone ? "#16a34a" : isActive ? "#6366f1" : "#d1d5db"}
                strokeWidth={isActive ? 3.5 : 2.5}
                strokeLinecap="round"
                strokeDasharray={isActive ? "10 5" : undefined}
                className={isActive ? "rv-dash" : undefined}
              />
            );
          })}

          {/* ── Truck ── */}
          <g className="rv-truck" style={{ transformOrigin: `${fromX}px ${LINE_Y - 18}px` }}>
            <rect x={fromX - 18} y={LINE_Y - 34} width={36} height={22} rx={5}
              fill="#fef3c7" stroke="#d97706" strokeWidth={1.5} />
            <text x={fromX} y={LINE_Y - 18} textAnchor="middle" fontSize={17}
              style={{ userSelect: "none", fontFamily: "serif" }}>🚐</text>
          </g>

          {/* ── Nodes ── */}
          {nodes.map((node, i) => {
            const cx     = START_X + i * NODE_GAP;
            const isNext = i === nextIdx;
            const isBake = node.kind === "bakery";
            const fill   = node.delivered
              ? (isBake ? "#92400e" : "#16a34a")
              : isNext ? "#6366f1" : "#9ca3af";

            return (
              <g key={node.id}>
                {/* Pulse ring on next stop */}
                {isNext && (
                  <circle className="rv-pulse" cx={cx} cy={LINE_Y} r={NODE_R + 5}
                    fill="none" stroke="#6366f1" strokeWidth={2} />
                )}

                {/* Shadow */}
                <circle cx={cx + 1} cy={LINE_Y + 2} r={NODE_R} fill="rgba(0,0,0,.12)" />

                {/* Main circle */}
                <circle cx={cx} cy={LINE_Y} r={NODE_R}
                  fill={fill} stroke="white" strokeWidth={2.5} />

                {/* Icon / number */}
                {isBake ? (
                  <text x={cx} y={LINE_Y + 6} textAnchor="middle" fontSize={16}
                    style={{ userSelect: "none" }}>🏠</text>
                ) : node.delivered ? (
                  <text x={cx} y={LINE_Y + 5} textAnchor="middle" fontSize={14}
                    fill="white" fontWeight="800">✓</text>
                ) : (
                  <text x={cx} y={LINE_Y + 5} textAnchor="middle" fontSize={13}
                    fill="white" fontWeight="700">{(node as Extract<Node, { kind: "stop" }>).num}</text>
                )}

                {/* Name */}
                <text x={cx} y={LINE_Y + NODE_R + 16} textAnchor="middle"
                  fontSize={10} fontWeight={isNext ? "700" : "400"}
                  fill={isNext ? "#4f46e5" : "var(--text)"}>
                  {trunc(isBake ? (i === 0 ? "Start" : "Einde") : node.label, 16)}
                </text>

                {/* City (small) */}
                {!isBake && (
                  <text x={cx} y={LINE_Y + NODE_R + 27} textAnchor="middle"
                    fontSize={9} fill="var(--text-subtle)">
                    {trunc(node.sub, 14)}
                  </text>
                )}

                {/* Delivery time */}
                {node.deliveredAt && (
                  <text x={cx} y={LINE_Y + NODE_R + (isBake ? 16 : 38)} textAnchor="middle"
                    fontSize={9} fill="#16a34a" fontWeight="600">
                    ✓ {fmtTime(node.deliveredAt)}
                  </text>
                )}

                {/* "volgende stop" label */}
                {isNext && !node.deliveredAt && (
                  <text x={cx} y={LINE_Y + NODE_R + 38} textAnchor="middle"
                    fontSize={9} fill="#6366f1" fontWeight="600">
                    volgende stop
                  </text>
                )}
              </g>
            );
          })}

          {/* Empty state */}
          {busStops.length === 0 && (
            <text x={totalWidth / 2} y={LINE_Y + 6} textAnchor="middle"
              fontSize={12} fill="#9ca3af">
              Voeg stops toe om de route te zien
            </text>
          )}

          {/* All done banner */}
          {allDone && (
            <text x={totalWidth / 2} y={SVG_H - 12} textAnchor="middle"
              fontSize={12} fill="#16a34a" fontWeight="700">
              🎉 Alle stops geleverd!
            </text>
          )}
        </svg>
      </div>

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
