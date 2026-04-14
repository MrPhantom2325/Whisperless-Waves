"use client";

import { useEffect, useRef, useState, useCallback } from "react";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const GRID_SIZE = 12;
const MOVE_INTERVAL = 420; // ms between auto-moves when key held

// ─── STAGE DEFINITIONS ───────────────────────────────────────────────────────
const STAGES = [
  {
    id: 1,
    name: "Open Waters",
    subtitle: "The horizon is clear. Learn to speak as one.",
    objective: "Navigate to Isla del Tesoro",
    fogRadius: null,       // full visibility
    mapBlur: 0,            // px blur on captain map
    controlLag: 0,         // ms delay on navigator inputs
    stormActive: false,
    falseLandmarks: false,
    memoryMode: false,
    windSpeed: 12,
    windDir: 45,
    hazardDensity: "low",
  },
  {
    id: 2,
    name: "The Reef Maze",
    subtitle: "The rocks are patient. Your voice had better be faster.",
    objective: "Thread through the reef belt — 4 reef cells line the path",
    fogRadius: null,
    mapBlur: 0,
    controlLag: 0,
    stormActive: false,
    falseLandmarks: false,
    memoryMode: false,
    windSpeed: 18,
    windDir: 90,
    hazardDensity: "high",
  },
  {
    id: 3,
    name: "The Storm",
    subtitle: "Rain on the glass. Salt in the eyes. Keep talking.",
    objective: "Reach calmer waters before hull reaches zero",
    fogRadius: null,
    mapBlur: 3,            // map blurs in and out
    controlLag: 300,       // inputs lag
    stormActive: true,
    falseLandmarks: false,
    memoryMode: false,
    windSpeed: 34,
    windDir: 270,
    hazardDensity: "high",
  },
  {
    id: 4,
    name: "The Fog Bank",
    subtitle: "The map shows two tiles. Trust the one who can see them.",
    objective: "Navigate using only what's immediately around the ship",
    fogRadius: 2,          // captain sees only 2-tile radius
    mapBlur: 0,
    controlLag: 0,
    stormActive: false,
    falseLandmarks: false,
    memoryMode: false,
    windSpeed: 8,
    windDir: 180,
    hazardDensity: "medium",
  },
  {
    id: 5,
    name: "The Siren Rocks",
    subtitle: "Two islands look like the destination. Only one is real.",
    objective: "Identify the true Isla del Tesoro — the sirens will mislead you",
    fogRadius: null,
    mapBlur: 0,
    controlLag: 0,
    stormActive: false,
    falseLandmarks: true,  // decoy destinations added
    memoryMode: false,
    windSpeed: 22,
    windDir: 135,
    hazardDensity: "medium",
  },
  {
    id: 6,
    name: "The Blackout",
    subtitle: "Both screens go dark. Your memory is the only map.",
    objective: "Navigate from memory alone — the map vanishes in 10 seconds",
    fogRadius: null,
    mapBlur: 0,
    controlLag: 0,
    stormActive: false,
    falseLandmarks: false,
    memoryMode: true,      // map hides after countdown
    windSpeed: 15,
    windDir: 315,
    hazardDensity: "low",
  },
];

// ─── MAP LAYOUTS PER STAGE ───────────────────────────────────────────────────
function buildMap(stageId) {
  const cells = {};

  const base = {
    reefs:    [[1,3],[2,5],[4,2],[5,7],[7,4],[8,9],[10,3],[11,6]],
    islands:  [[3,8],[9,2],[6,5]],
    currents: [[2,7],[3,4],[7,8],[10,7]],
    dest:     [9, 9],
  };

  const extra = {
    2: { reefs: [[2,2],[3,3],[4,4],[5,5],[6,6],[5,3],[3,6],[4,8]] },
    3: { reefs: [[1,1],[2,3],[3,6],[5,2],[6,8],[8,4],[9,6],[10,2],[11,8]] },
    4: { reefs: [[2,4],[4,3],[5,6],[7,3],[8,7],[10,5]] },
    5: { reefs: [[1,5],[3,2],[5,9],[7,6],[9,4],[11,3]] },
    6: { reefs: [[2,5],[4,2],[6,7],[8,3],[10,6]] },
  };

  const r = stageId >= 2 && extra[stageId]
    ? [...base.reefs, ...extra[stageId].reefs]
    : base.reefs;

  r.forEach(([c, row]) => { cells[`${c},${row}`] = "reef"; });
  base.islands.forEach(([c, row]) => { cells[`${c},${row}`] = "island"; });
  base.currents.forEach(([c, row]) => { cells[`${c},${row}`] = "current"; });
  cells[`${base.dest[0]},${base.dest[1]}`] = "destination";

  // Stage 5: add decoy destinations
  if (stageId === 5) {
    cells["3,3"] = "decoy";
    cells["7,10"] = "decoy";
  }

  return { cells, dest: base.dest };
}

const LANDMARKS = {
  "3,8": "Skull Rock",
  "9,2": "Twin Peaks",
  "6,5": "The Serpent's Spine",
  "9,9": "Isla del Tesoro",
};

// ─── INITIAL SHIP ─────────────────────────────────────────────────────────────
function makeShip(stage) {
  return {
    x: 1, y: 1,
    heading: 0,
    speed: 0,
    sails: 0,
    hullHP: 3,
    anchor: false,
    windDir: stage.windDir,
    windSpeed: stage.windSpeed,
  };
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function headingLabel(deg) {
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

function dist(ax, ay, bx, by) {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

function headingToVec(deg) {
  const rad = (deg - 90) * Math.PI / 180;
  return { dx: Math.round(Math.cos(rad)), dy: Math.round(Math.sin(rad)) };
}

// ─── BUTTON STYLE ────────────────────────────────────────────────────────────
const btnStyle = {
  padding: "6px 10px",
  background: "#0D0904",
  border: "1px solid #3A2E12",
  color: "#8B7340",
  fontFamily: "'Courier New', monospace",
  fontSize: 10,
  letterSpacing: 1,
  cursor: "pointer",
  borderRadius: 2,
  transition: "all 0.15s",
};

// ═══════════════════════════════════════════════════════════════════════════════
//  STAGE INTRO CARD
// ═══════════════════════════════════════════════════════════════════════════════
function StageIntroCard({ stage, onBegin, memoryCountdown }) {
  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 50,
      background: "rgba(8,6,3,0.94)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 28, fontFamily: "'Courier New', monospace",
    }}>
      <div style={{ position: "absolute", inset: 32, border: "1px solid #2A2010", pointerEvents: "none" }} />

      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 10, letterSpacing: 5, color: "#3A2E12", marginBottom: 12 }}>
          STAGE {stage.id} OF 6
        </div>
        <div style={{
          fontSize: 36, color: "#C8961E", letterSpacing: 2, lineHeight: 1.2, marginBottom: 8,
          textShadow: "0 0 30px rgba(200,150,30,0.3)",
        }}>
          {stage.name}
        </div>
        <div style={{ fontSize: 12, color: "#5C4A1E", letterSpacing: 1, marginBottom: 24, lineHeight: 1.6 }}>
          {stage.subtitle}
        </div>

        {/* Stage-specific warnings */}
        <div style={{
          border: "1px solid #2A2010", padding: "14px 24px",
          maxWidth: 480, textAlign: "left",
          display: "flex", flexDirection: "column", gap: 8,
        }}>
          <div style={{ fontSize: 9, letterSpacing: 3, color: "#5C4A1E", marginBottom: 4 }}>BRIEFING</div>
          <div style={{ fontSize: 11, color: "#3A2E12", lineHeight: 1.7 }}>{stage.objective}</div>
          {stage.mapBlur > 0 && (
            <div style={{ fontSize: 10, color: "#8B3A3A" }}>⚠ CAPTAIN: The storm blurs your chart. Describe what you can.</div>
          )}
          {stage.controlLag > 0 && (
            <div style={{ fontSize: 10, color: "#8B3A3A" }}>⚠ NAVIGATOR: Controls are sluggish in the storm. Anticipate.</div>
          )}
          {stage.fogRadius && (
            <div style={{ fontSize: 10, color: "#4A7FBB" }}>⚠ CAPTAIN: Visibility limited to {stage.fogRadius} tiles around the ship.</div>
          )}
          {stage.falseLandmarks && (
            <div style={{ fontSize: 10, color: "#8B3A3A" }}>⚠ CAPTAIN: Two islands mimic the destination. Only one is marked ✦</div>
          )}
          {stage.memoryMode && (
            <div style={{ fontSize: 10, color: "#C8961E" }}>⚠ BOTH: You have 10 seconds to study the map. Then it goes dark.</div>
          )}
        </div>
      </div>

      <button
        onClick={onBegin}
        style={{
          padding: "12px 40px",
          background: "transparent",
          border: "1px solid #C8961E",
          color: "#C8961E",
          fontFamily: "'Courier New', monospace",
          fontSize: 11, letterSpacing: 4,
          cursor: "pointer",
        }}
        onMouseEnter={e => { e.target.style.background = "rgba(200,150,30,0.1)"; }}
        onMouseLeave={e => { e.target.style.background = "transparent"; }}
      >
        {stage.id === 6 ? "BEGIN FINAL STAGE" : "SET SAIL"}
      </button>

      {/* Stage pip indicators */}
      <div style={{ display: "flex", gap: 8 }}>
        {STAGES.map(s => (
          <div key={s.id} style={{
            width: 10, height: 10, borderRadius: "50%",
            background: s.id === stage.id ? "#D4A420" : s.id < stage.id ? "#3A2E12" : "#1A1208",
            border: "1px solid #3A2E12",
            boxShadow: s.id === stage.id ? "0 0 6px rgba(212,164,32,0.6)" : "none",
          }} />
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CAPTAIN'S MAP PANEL
// ═══════════════════════════════════════════════════════════════════════════════
function CaptainPanel({ ship, pingCell, captorPos, stage, mapData, memoryHidden, memoryCountdown }) {
  const CELL = 44;
  const { cells } = mapData;

  function cellColor(type) {
    switch (type) {
      case "reef":        return "#8B3A3A";
      case "island":      return "#4A6741";
      case "current":     return "#2A4A6B";
      case "destination": return "#7B5E2A";
      case "decoy":       return "#7B5E2A"; // looks identical to destination
      default:            return "transparent";
    }
  }

  function cellIcon(type) {
    switch (type) {
      case "reef":        return "⚡";
      case "island":      return "⛰";
      case "current":     return "〜";
      case "destination": return "✦";
      case "decoy":       return "✦"; // identical glyph — Captain must read landmarks
      default:            return "";
    }
  }

  const isVisible = (col, row) => {
    if (!stage.fogRadius) return true;
    return dist(col, row, ship.x, ship.y) <= stage.fogRadius;
  };

  const blurAmount = stage.stormActive
    ? `${stage.mapBlur + Math.sin(Date.now() / 800) * 1.5}px`
    : "0px";

  return (
    <div style={{
      flex: "0 0 58%",
      background: "linear-gradient(160deg, #1a1208 0%, #0d1a12 60%, #0a1018 100%)",
      borderRight: "3px solid #5C4A1E",
      display: "flex", flexDirection: "column",
      position: "relative", overflow: "hidden",
    }}>
      {/* Storm rain overlay */}
      {stage.stormActive && (
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none", zIndex: 3,
          background: `repeating-linear-gradient(
            105deg,
            transparent, transparent 8px,
            rgba(60,90,120,0.06) 8px, rgba(60,90,120,0.06) 9px
          )`,
          animation: "rainScroll 0.4s linear infinite",
        }} />
      )}

      {/* Memory mode dark overlay */}
      {memoryHidden && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 20,
          background: "#080603",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 16,
        }}>
          <div style={{ fontSize: 13, color: "#3A2E12", fontFamily: "'Courier New', monospace", letterSpacing: 3 }}>
            THE MAP IS GONE
          </div>
          <div style={{ fontSize: 10, color: "#2A2010", fontFamily: "'Courier New', monospace", letterSpacing: 2, textAlign: "center", maxWidth: 260, lineHeight: 1.8 }}>
            Speak from memory.<br />Guide the Navigator to Isla del Tesoro.
          </div>
        </div>
      )}

      {/* Memory countdown banner */}
      {stage.memoryMode && !memoryHidden && memoryCountdown > 0 && (
        <div style={{
          position: "absolute", top: 56, left: 0, right: 0, zIndex: 15,
          background: "rgba(200,150,30,0.15)", borderTop: "1px solid #C8961E", borderBottom: "1px solid #C8961E",
          padding: "6px 24px", textAlign: "center",
          fontFamily: "'Courier New', monospace", fontSize: 11, color: "#C8961E", letterSpacing: 2,
        }}>
          MEMORISE THE MAP — BLACKOUT IN {memoryCountdown}s
        </div>
      )}

      {/* Header */}
      <div style={{
        padding: "14px 24px 10px",
        borderBottom: "1px solid #3A2E12",
        display: "flex", alignItems: "center", gap: 12, zIndex: 4,
      }}>
        <span style={{ fontSize: 10, letterSpacing: 4, color: "#8B7340", fontFamily: "'Courier New', monospace" }}>
          CAPTAIN'S CHART
        </span>
        <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, #5C4A1E, transparent)" }} />
        {stage.fogRadius && (
          <span style={{ fontSize: 9, color: "#4A7FBB", fontFamily: "'Courier New', monospace", letterSpacing: 1 }}>
            FOG — {stage.fogRadius} TILE RADIUS
          </span>
        )}
        <span style={{ fontSize: 9, color: "#3A2E12", fontFamily: "'Courier New', monospace" }}>
          [WASD] CURSOR · [SPACE] PING
        </span>
      </div>

      {/* Map grid */}
      <div style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, zIndex: 2,
        filter: stage.stormActive ? `blur(${stage.mapBlur}px)` : "none",
        transition: "filter 0.5s",
      }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(${GRID_SIZE}, ${CELL}px)`,
          gridTemplateRows:    `repeat(${GRID_SIZE}, ${CELL}px)`,
          border: "2px solid #3A2E12",
          boxShadow: "0 0 40px rgba(92,74,30,0.2), inset 0 0 60px rgba(0,0,0,0.5)",
        }}>
          {Array.from({ length: GRID_SIZE }, (_, row) =>
            Array.from({ length: GRID_SIZE }, (_, col) => {
              const key   = `${col},${row}`;
              const type  = cells[key] || "sea";
              const vis   = isVisible(col, row);
              const isShip = ship.x === col && ship.y === row;
              const isCursor = captorPos.x === col && captorPos.y === row;
              const isPing = pingCell === key;
              const lmName = type === "destination" ? "Isla del Tesoro" : LANDMARKS[key];

              return (
                <div key={key} style={{
                  width: CELL, height: CELL,
                  background: !vis
                    ? "rgba(0,0,0,0.85)"
                    : isShip
                      ? "rgba(180,140,40,0.18)"
                      : type !== "sea"
                        ? `${cellColor(type)}33`
                        : (col + row) % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent",
                  border: "0.5px solid rgba(92,74,30,0.15)",
                  position: "relative",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "background 0.3s",
                  boxShadow: isPing ? "inset 0 0 14px rgba(255,200,50,0.7)" : "none",
                  overflow: "hidden",
                }}>
                  {vis && type !== "sea" && (
                    <span style={{ fontSize: 16, opacity: 0.65, userSelect: "none" }}>
                      {cellIcon(type)}
                    </span>
                  )}
                  {vis && lmName && (
                    <span style={{
                      position: "absolute", bottom: 1, left: 0, right: 0,
                      fontSize: 6, color: type === "decoy" ? "#5C4A1E" : "#8B7340",
                      textAlign: "center",
                      fontFamily: "'Courier New', monospace", lineHeight: 1, opacity: 0.75,
                      pointerEvents: "none",
                    }}>
                      {type === "decoy" ? "???" : lmName}
                    </span>
                  )}
                  {isShip && (
                    <div style={{
                      position: "absolute", inset: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <div style={{
                        width: 18, height: 18,
                        background: "#D4A420",
                        clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)",
                        transform: `rotate(${ship.heading}deg)`,
                        transition: "transform 0.4s",
                        filter: "drop-shadow(0 0 5px #D4A420)",
                      }} />
                    </div>
                  )}
                  {isCursor && !isShip && (
                    <div style={{
                      position: "absolute", inset: 2,
                      border: "1px solid rgba(212,164,32,0.5)",
                      borderRadius: 1, pointerEvents: "none",
                    }} />
                  )}
                  {isPing && (
                    <div style={{
                      position: "absolute", inset: -3,
                      border: "2px solid #FFD700", borderRadius: 1,
                      animation: "pingFade 1.5s ease-out forwards",
                      pointerEvents: "none",
                    }} />
                  )}
                  {!vis && (
                    <div style={{
                      position: "absolute", inset: 0,
                      background: "rgba(0,0,0,0.85)",
                    }} />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Legend */}
      <div style={{
        padding: "8px 24px", borderTop: "1px solid #3A2E12",
        display: "flex", gap: 16, zIndex: 2, flexWrap: "wrap",
      }}>
        {[["⚡","Reef","#8B3A3A"],["⛰","Island","#4A6741"],["〜","Current","#2A4A6B"],["✦","Destination","#C8961E"]].map(([icon, label, color]) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 11 }}>{icon}</span>
            <span style={{ fontSize: 8, color, fontFamily: "'Courier New', monospace", letterSpacing: 1 }}>{label.toUpperCase()}</span>
          </div>
        ))}
        {stage.falseLandmarks && (
          <span style={{ fontSize: 8, color: "#8B3A3A", fontFamily: "'Courier New', monospace", letterSpacing: 1, marginLeft: "auto" }}>
            ⚠ DECOYS ACTIVE
          </span>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  NAVIGATOR'S CONTROL PANEL
// ═══════════════════════════════════════════════════════════════════════════════
function NavigatorPanel({ ship, stage, onSteer, onSails, onAnchor, stageIndex, memoryHidden }) {
  const [wobble, setWobble] = useState(0);
  const [stormShake, setStormShake] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const id = setInterval(() => {
      setWobble(Math.sin(Date.now() / 600) * (stage.stormActive ? 6 : 2));
      if (stage.stormActive) {
        setStormShake({
          x: (Math.random() - 0.5) * 4,
          y: (Math.random() - 0.5) * 4,
        });
      }
    }, 80);
    return () => clearInterval(id);
  }, [stage.stormActive]);

  const compassAngle = ship.heading + wobble;
  const lagLabel = stage.controlLag > 0 ? ` (${stage.controlLag}ms lag)` : "";

  return (
    <div style={{
      flex: "0 0 42%",
      background: "linear-gradient(170deg, #110D08 0%, #1A1008 50%, #0E1512 100%)",
      display: "flex", flexDirection: "column",
      position: "relative", overflow: "hidden",
      transform: stage.stormActive ? `translate(${stormShake.x}px, ${stormShake.y}px)` : "none",
      transition: stage.stormActive ? "none" : "transform 0.1s",
    }}>
      {/* Wood grain */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1,
        backgroundImage: `repeating-linear-gradient(88deg, transparent, transparent 18px, rgba(92,60,20,0.04) 18px, rgba(92,60,20,0.04) 19px)`,
      }} />

      {/* Memory mode dark overlay on nav panel too */}
      {memoryHidden && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 20,
          background: "#080603",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 12,
        }}>
          <div style={{ fontSize: 13, color: "#3A2E12", fontFamily: "'Courier New', monospace", letterSpacing: 3 }}>
            HELM ONLY
          </div>
          <div style={{ fontSize: 10, color: "#2A2010", fontFamily: "'Courier New', monospace", letterSpacing: 1, textAlign: "center", maxWidth: 200, lineHeight: 1.8 }}>
            Controls still active.<br />Listen to the Captain.
          </div>
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8, fontSize: 10, color: "#3A2E12", fontFamily: "'Courier New', monospace" }}>
            <span>← → Steer</span>
            <span>↑ ↓ Sails</span>
            <span>Q Anchor</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{
        padding: "14px 24px 10px",
        borderBottom: "1px solid #3A2E12",
        display: "flex", alignItems: "center", gap: 12, zIndex: 2,
      }}>
        <span style={{ fontSize: 10, letterSpacing: 4, color: "#8B7340", fontFamily: "'Courier New', monospace" }}>
          HELM CONTROLS
        </span>
        <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, #5C4A1E, transparent)" }} />
        {stage.controlLag > 0 && (
          <span style={{ fontSize: 9, color: "#8B3A3A", fontFamily: "'Courier New', monospace", letterSpacing: 1 }}>
            STORM LAG
          </span>
        )}
        <span style={{ fontSize: 9, color: "#3A2E12", fontFamily: "'Courier New', monospace" }}>
          [↑↓←→] [Q]
        </span>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "16px 20px", gap: 16, zIndex: 2, overflowY: "auto" }}>

        {/* ── COMPASS ── */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 9, letterSpacing: 3, color: "#5C4A1E", fontFamily: "'Courier New', monospace" }}>COMPASS</span>
          <div style={{
            position: "relative", width: 130, height: 130,
            borderRadius: "50%",
            background: "radial-gradient(circle at 35% 35%, #2A1F0C, #0D0904)",
            border: "3px solid #5C4A1E",
            boxShadow: "0 0 20px rgba(92,74,30,0.3), inset 0 0 30px rgba(0,0,0,0.6)",
          }}>
            {[["N",0],["E",90],["S",180],["W",270]].map(([dir, deg]) => (
              <div key={dir} style={{
                position: "absolute", top: "50%", left: "50%",
                transform: `rotate(${deg}deg) translateY(-52px) translateX(-50%)`,
                fontSize: 9, color: dir === "N" ? "#CC3333" : "#8B7340",
                fontFamily: "'Courier New', monospace", fontWeight: "bold",
              }}>{dir}</div>
            ))}
            {[0,45,90,135].map(d => (
              <div key={d} style={{
                position: "absolute", top: "50%", left: "50%",
                width: "88%", height: 1,
                background: "rgba(92,74,30,0.25)",
                transform: `translate(-50%, -50%) rotate(${d}deg)`,
              }} />
            ))}
            <div style={{
              position: "absolute", top: "50%", left: "50%",
              transform: `translate(-50%, -50%) rotate(${compassAngle}deg)`,
              transition: "transform 0.15s",
            }}>
              <div style={{ width: 4, height: 48, marginLeft: -2, marginTop: -48, background: "linear-gradient(to bottom, #CC3333, #882222)", borderRadius: "2px 2px 0 0" }} />
              <div style={{ width: 4, height: 34, marginLeft: -2, background: "linear-gradient(to bottom, #888, #444)", borderRadius: "0 0 2px 2px" }} />
            </div>
            <div style={{
              position: "absolute", top: "50%", left: "50%",
              width: 7, height: 7, borderRadius: "50%",
              background: "#D4A420",
              transform: "translate(-50%, -50%)",
              boxShadow: "0 0 4px rgba(212,164,32,0.8)",
            }} />
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ fontSize: 18, color: "#D4A420", fontFamily: "'Courier New', monospace", fontWeight: "bold" }}>
              {headingLabel(ship.heading)}
            </span>
            <span style={{ fontSize: 11, color: "#5C4A1E", fontFamily: "'Courier New', monospace" }}>
              {Math.round(ship.heading)}°
            </span>
          </div>
        </div>

        {/* ── SAILS ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: 9, letterSpacing: 3, color: "#5C4A1E", fontFamily: "'Courier New', monospace" }}>SAIL DEPLOYMENT</span>
            <span style={{ fontSize: 14, color: "#D4A420", fontFamily: "'Courier New', monospace" }}>{ship.sails}%</span>
          </div>
          <div style={{
            height: 14, background: "#0D0904",
            border: "1px solid #3A2E12", borderRadius: 2,
            position: "relative", overflow: "hidden",
          }}>
            <div style={{
              position: "absolute", left: 0, top: 0, bottom: 0,
              width: `${ship.sails}%`,
              background: `linear-gradient(90deg, #3A2E12, #8B7340 ${ship.sails < 30 ? "100%" : "60%"}, #D4A420)`,
              transition: "width 0.3s",
            }} />
            {[25,50,75].map(t => (
              <div key={t} style={{
                position: "absolute", left: `${t}%`, top: 0, bottom: 0,
                width: 1, background: "rgba(92,74,30,0.4)",
              }} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => onSails("down")} style={{ ...btnStyle, flex: 1, fontSize: 9 }}>▼ LOWER [↓]</button>
            <button onClick={() => onSails("up")}   style={{ ...btnStyle, flex: 1, fontSize: 9 }}>▲ RAISE [↑]</button>
          </div>
        </div>

        {/* ── SPEED & WIND ── */}
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 9, letterSpacing: 3, color: "#5C4A1E", fontFamily: "'Courier New', monospace" }}>SPEED</span>
            <div style={{ display: "flex", gap: 3 }}>
              {[1,2,3].map(i => (
                <div key={i} style={{
                  flex: 1, height: 20,
                  background: ship.speed >= i ? `hsl(${40 - i * 10}, 70%, ${30 + i * 8}%)` : "#0D0904",
                  border: "1px solid #3A2E12", borderRadius: 2,
                  transition: "background 0.3s",
                }} />
              ))}
            </div>
            <span style={{ fontSize: 9, color: "#8B7340", fontFamily: "'Courier New', monospace", textAlign: "center" }}>
              {["DEAD STOP","SLOW","STEADY","FULL SAIL"][ship.speed]}
            </span>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5, alignItems: "center" }}>
            <span style={{ fontSize: 9, letterSpacing: 3, color: "#5C4A1E", fontFamily: "'Courier New', monospace" }}>WIND</span>
            <div style={{
              width: 44, height: 44, borderRadius: "50%",
              border: "1px solid #3A2E12", background: "#0D0904",
              position: "relative", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <div style={{
                position: "absolute", width: 2, height: 16,
                background: "#4A7FBB",
                transformOrigin: "bottom center",
                bottom: "50%", left: "calc(50% - 1px)",
                transform: `rotate(${ship.windDir}deg)`,
                borderRadius: 1,
              }} />
              <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#3A2E12" }} />
            </div>
            <span style={{ fontSize: 9, color: "#4A7FBB", fontFamily: "'Courier New', monospace" }}>
              {ship.windSpeed}kn {headingLabel(ship.windDir)}
            </span>
          </div>
        </div>

        {/* ── STEERING ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 9, letterSpacing: 3, color: "#5C4A1E", fontFamily: "'Courier New', monospace" }}>
            HELM{stage.controlLag > 0 ? " — SLUGGISH" : ""}
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => onSteer("left")}  style={{ ...btnStyle, flex: 1, fontSize: 9 }}>◀ PORT [←]</button>
            <button onClick={() => onSteer("right")} style={{ ...btnStyle, flex: 1, fontSize: 9 }}>STBD [→] ▶</button>
          </div>
        </div>

        {/* ── HULL & ANCHOR ── */}
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 9, letterSpacing: 3, color: "#5C4A1E", fontFamily: "'Courier New', monospace" }}>HULL</span>
            <div style={{ display: "flex", gap: 5 }}>
              {[1,2,3].map(i => (
                <div key={i} style={{
                  width: 22, height: 22, borderRadius: 2,
                  background: ship.hullHP >= i ? "#8B2020" : "#0D0904",
                  border: "1px solid #3A2E12",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, transition: "background 0.3s",
                  boxShadow: ship.hullHP >= i ? "0 0 5px rgba(139,32,32,0.5)" : "none",
                }}>
                  {ship.hullHP >= i ? "❤" : ""}
                </div>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 9, letterSpacing: 3, color: "#5C4A1E", fontFamily: "'Courier New', monospace" }}>ANCHOR</span>
            <button onClick={onAnchor} style={{
              ...btnStyle, fontSize: 9,
              background: ship.anchor ? "rgba(212,164,32,0.15)" : "#0D0904",
              borderColor: ship.anchor ? "#D4A420" : "#3A2E12",
              color: ship.anchor ? "#D4A420" : "#5C4A1E",
            }}>
              ⚓ {ship.anchor ? "DROPPED [Q]" : "RAISED [Q]"}
            </button>
          </div>
        </div>

        {/* ── SHIP POSITION (visible in all stages) ── */}
        <div style={{
          borderTop: "1px solid #1A1208", paddingTop: 10,
          display: "flex", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 9, letterSpacing: 2, color: "#2A2010", fontFamily: "'Courier New', monospace" }}>
            POSITION
          </span>
          <span style={{ fontSize: 9, color: "#3A2E12", fontFamily: "'Courier New', monospace" }}>
            {String.fromCharCode(65 + ship.x)}{ship.y + 1}
          </span>
        </div>
      </div>

      {/* Stage footer */}
      <div style={{
        padding: "8px 20px", borderTop: "1px solid #3A2E12",
        display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 2,
      }}>
        <span style={{ fontSize: 8, letterSpacing: 2, color: "#2A2010", fontFamily: "'Courier New', monospace" }}>
          STAGE {stage.id} — {stage.name.toUpperCase()}
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          {STAGES.map(s => (
            <div key={s.id} style={{
              width: 7, height: 7, borderRadius: "50%",
              background: s.id === stage.id ? "#D4A420" : s.id < stage.id ? "#3A2E12" : "#1A1208",
              border: "1px solid #2A2010",
              boxShadow: s.id === stage.id ? "0 0 4px rgba(212,164,32,0.6)" : "none",
            }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  STAGE COMPLETE CARD
// ═══════════════════════════════════════════════════════════════════════════════
function StageCompleteCard({ stage, onNext, isLastStage }) {
  const messages = [
    "The reef belt is behind you. The sea opens ahead.",
    "You weathered the storm together. Not a single soul lost.",
    "The storm is past. Your words held the ship true.",
    "Through the fog, you found each other's voice.",
    "The sirens failed. You trusted the right star.",
    "",
  ];

  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 50,
      background: "rgba(8,6,3,0.96)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 24, fontFamily: "'Courier New', monospace",
    }}>
      <div style={{ position: "absolute", inset: 32, border: "1px solid #2A2010", pointerEvents: "none" }} />

      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 10, letterSpacing: 5, color: "#5C4A1E", marginBottom: 14 }}>
          STAGE {stage.id} COMPLETE
        </div>
        <div style={{
          fontSize: 30, color: "#C8961E", letterSpacing: 2, marginBottom: 12,
          textShadow: "0 0 20px rgba(200,150,30,0.3)",
        }}>
          {stage.name}
        </div>
        <div style={{
          fontSize: 11, color: "#5C4A1E", maxWidth: 420, lineHeight: 1.8,
          borderLeft: "2px solid #2A2010", paddingLeft: 16, textAlign: "left",
        }}>
          {messages[stage.id - 1]}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        {STAGES.map(s => (
          <div key={s.id} style={{
            width: 10, height: 10, borderRadius: "50%",
            background: s.id <= stage.id ? "#D4A420" : "#1A1208",
            border: "1px solid #3A2E12",
            boxShadow: s.id <= stage.id ? "0 0 5px rgba(212,164,32,0.5)" : "none",
          }} />
        ))}
      </div>

      <button
        onClick={onNext}
        style={{
          padding: "12px 40px",
          background: "transparent",
          border: "1px solid #C8961E",
          color: "#C8961E",
          fontFamily: "'Courier New', monospace",
          fontSize: 11, letterSpacing: 4,
          cursor: "pointer",
        }}
        onMouseEnter={e => { e.target.style.background = "rgba(200,150,30,0.1)"; }}
        onMouseLeave={e => { e.target.style.background = "transparent"; }}
      >
        {isLastStage ? "CLAIM THE TREASURE" : `STAGE ${stage.id + 1} →`}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  DAMAGE FLASH
// ═══════════════════════════════════════════════════════════════════════════════
function DamageFlash({ active }) {
  if (!active) return null;
  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 40, pointerEvents: "none",
      background: "rgba(139,32,32,0.35)",
      animation: "damageFlash 0.4s ease-out forwards",
    }} />
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  GAME OVER SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
function GameOverScreen({ stage, onRetry }) {
  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 60,
      background: "rgba(8,6,3,0.97)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 24, fontFamily: "'Courier New', monospace",
    }}>
      <div style={{ position: "absolute", inset: 32, border: "1px solid #3A1010", pointerEvents: "none" }} />
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 10, letterSpacing: 5, color: "#5C2020", marginBottom: 14 }}>THE SHIP IS LOST</div>
        <div style={{ fontSize: 30, color: "#8B2020", letterSpacing: 2, marginBottom: 8 }}>Hull Destroyed</div>
        <div style={{ fontSize: 11, color: "#3A2020", lineHeight: 1.8, maxWidth: 360 }}>
          Stage {stage.id} — {stage.name}.<br />The sea claimed you. But the treasure still waits.
        </div>
      </div>
      <button
        onClick={onRetry}
        style={{
          padding: "12px 40px",
          background: "transparent",
          border: "1px solid #8B2020",
          color: "#8B2020",
          fontFamily: "'Courier New', monospace",
          fontSize: 11, letterSpacing: 4, cursor: "pointer",
        }}
        onMouseEnter={e => { e.target.style.background = "rgba(139,32,32,0.1)"; }}
        onMouseLeave={e => { e.target.style.background = "transparent"; }}
      >
        TRY THIS STAGE AGAIN
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  INTRO SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
function IntroScreen({ onStart }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "#080603",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 32, zIndex: 100, fontFamily: "'Courier New', monospace",
    }}>
      <div style={{ position: "absolute", inset: 24, border: "1px solid #2A2010", pointerEvents: "none" }} />
      <div style={{ position: "absolute", inset: 28, border: "1px solid #1A1408", pointerEvents: "none" }} />

      <div style={{ textAlign: "center", maxWidth: 560 }}>
        <div style={{ fontSize: 11, letterSpacing: 6, color: "#5C4A1E", marginBottom: 16 }}>WHISPERLESS WAVES</div>
        <h1 style={{ fontSize: 40, fontWeight: "normal", color: "#C8961E", lineHeight: 1.2, margin: "0 0 8px", letterSpacing: 2, textShadow: "0 0 40px rgba(200,150,30,0.4)" }}>
          The Blind Captain
        </h1>
        <h1 style={{ fontSize: 40, fontWeight: "normal", color: "#8B7340", lineHeight: 1.2, margin: "0 0 24px", letterSpacing: 2 }}>
          & The Mute Navigator
        </h1>
        <p style={{ color: "#5C4A1E", fontSize: 12, lineHeight: 1.8, letterSpacing: 1, borderLeft: "2px solid #3A2E12", paddingLeft: 16, textAlign: "left" }}>
          6 stages. One ship. Neither of you can do it alone.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, border: "1px solid #3A2E12", background: "#3A2E12" }}>
        {[
          ["CAPTAIN","Left side","Sees the map, hazards & destination","WASD to move cursor · SPACE to ping"],
          ["NAVIGATOR","Right side","Controls helm, sails & anchor","Arrow keys to steer & adjust sails · Q anchor"],
        ].map(([role, side, desc, keys]) => (
          <div key={role} style={{ background: "#080603", padding: "18px 22px", display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ fontSize: 9, letterSpacing: 4, color: "#C8961E" }}>{role}</div>
            <div style={{ fontSize: 10, color: "#5C4A1E" }}>{side} of screen</div>
            <div style={{ fontSize: 10, color: "#3A2E12", lineHeight: 1.5 }}>{desc}</div>
            <div style={{ fontSize: 9, color: "#8B7340", marginTop: 4 }}>{keys}</div>
          </div>
        ))}
      </div>

      <button
        onClick={onStart}
        style={{
          padding: "14px 48px", background: "transparent",
          border: "1px solid #C8961E", color: "#C8961E",
          fontFamily: "'Courier New', monospace", fontSize: 11, letterSpacing: 4, cursor: "pointer",
        }}
        onMouseEnter={e => { e.target.style.background = "rgba(200,150,30,0.1)"; e.target.style.boxShadow = "0 0 20px rgba(200,150,30,0.2)"; }}
        onMouseLeave={e => { e.target.style.background = "transparent"; e.target.style.boxShadow = "none"; }}
      >
        BEGIN VOYAGE
      </button>
      <div style={{ fontSize: 9, color: "#2A2010", letterSpacing: 2 }}>PHASE 4 — TRUST MECHANIC & THE VAULT</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN GAME
// ═══════════════════════════════════════════════════════════════════════════════
export default function BlindCaptainGame() {
  const [screen, setScreen] = useState("intro");       // intro | stageIntro | playing | stageComplete | gameover | trust | vault
  const [stageIdx, setStageIdx] = useState(0);
  const [ship, setShip] = useState(makeShip(STAGES[0]));
  const [captorPos, setCaptorPos] = useState({ x: 2, y: 2 });
  const [pingCell, setPingCell] = useState(null);
  const [damageFlash, setDamageFlash] = useState(false);
  const [mapData, setMapData] = useState(() => buildMap(1));
  const [memoryHidden, setMemoryHidden] = useState(false);
  const [memoryCountdown, setMemoryCountdown] = useState(10);

  // ── Phase 4: Trust mechanic ───────────────────────────────────────────────
  const [captainTrusts, setCaptainTrusts] = useState(false);
  const [navigatorTrusts, setNavigatorTrusts] = useState(false);
  const [vaultMerging, setVaultMerging] = useState(false);
  const trustWindowTimer = useRef(null);

  const pingTimer  = useRef(null);
  const damageTimer = useRef(null);
  const lagQueue   = useRef([]);
  const moveTimer  = useRef(null);
  const memTimer   = useRef(null);

  const stage = STAGES[stageIdx];

  // ── Start a stage ────────────────────────────────────────────────────────
  const beginStage = useCallback(() => {
    const s = STAGES[stageIdx];
    setShip(makeShip(s));
    setCaptorPos({ x: 1, y: 1 });
    setMapData(buildMap(s.id));
    setMemoryHidden(false);
    setMemoryCountdown(10);
    setScreen("playing");

    // Stage 6: start memory countdown
    if (s.memoryMode) {
      let count = 10;
      memTimer.current = setInterval(() => {
        count--;
        setMemoryCountdown(count);
        if (count <= 0) {
          clearInterval(memTimer.current);
          setMemoryHidden(true);
        }
      }, 1000);
    }
  }, [stageIdx]);

  // ── Move ship one step in heading direction ───────────────────────────────
  const advanceShip = useCallback(() => {
    setShip(prev => {
      if (prev.anchor || prev.speed === 0) return prev;
      const { dx, dy } = headingToVec(prev.heading);
      const nx = Math.max(0, Math.min(GRID_SIZE - 1, prev.x + dx));
      const ny = Math.max(0, Math.min(GRID_SIZE - 1, prev.y + dy));
      return { ...prev, x: nx, y: ny };
    });
  }, []);

  // ── Ship movement tick ────────────────────────────────────────────────────
  useEffect(() => {
    if (screen !== "playing") return;
    const tid = setInterval(advanceShip, MOVE_INTERVAL);
    return () => clearInterval(tid);
  }, [screen, advanceShip]);

  // ── Collision & destination detection ────────────────────────────────────
  useEffect(() => {
    if (screen !== "playing") return;
    const key = `${ship.x},${ship.y}`;
    const cellType = mapData.cells[key];

    if (cellType === "reef") {
      // Damage
      const newHP = ship.hullHP - 1;
      setShip(s => ({ ...s, hullHP: Math.max(0, s.hullHP - 1), x: 1, y: 1 }));
      setDamageFlash(true);
      clearTimeout(damageTimer.current);
      damageTimer.current = setTimeout(() => setDamageFlash(false), 500);
      if (newHP <= 0) {
        setScreen("gameover");
      }
    }

    if (cellType === "destination") {
      setScreen("stageComplete");
    }

    // Stage 5: decoy = damage
    if (cellType === "decoy" && stage.falseLandmarks) {
      const newHP = ship.hullHP - 1;
      setShip(s => ({ ...s, hullHP: Math.max(0, s.hullHP - 1), x: 1, y: 1 }));
      setDamageFlash(true);
      clearTimeout(damageTimer.current);
      damageTimer.current = setTimeout(() => setDamageFlash(false), 500);
      if (newHP <= 0) setScreen("gameover");
    }
  }, [ship.x, ship.y, screen]);

  // ── Storm: periodic random damage ────────────────────────────────────────
  useEffect(() => {
    if (screen !== "playing" || !stage.stormActive) return;
    const tid = setInterval(() => {
      if (Math.random() < 0.18) {
        setShip(s => {
          const hp = Math.max(0, s.hullHP - 1);
          if (hp <= 0) setScreen("gameover");
          return { ...s, hullHP: hp };
        });
        setDamageFlash(true);
        clearTimeout(damageTimer.current);
        damageTimer.current = setTimeout(() => setDamageFlash(false), 500);
      }
    }, 2800);
    return () => clearInterval(tid);
  }, [screen, stage.stormActive]);

  // ── Apply a navigator action (with optional lag) ──────────────────────────
  const applyNavAction = useCallback((fn) => {
    if (stage.controlLag > 0) {
      setTimeout(() => setShip(fn), stage.controlLag);
    } else {
      setShip(fn);
    }
  }, [stage.controlLag]);

  // ── Keyboard handler ──────────────────────────────────────────────────────
  const handleKey = useCallback((e) => {
    if (screen !== "playing") return;
    const k = e.key;

    // Captain WASD
    if (k === "w" || k === "W") setCaptorPos(p => ({ ...p, y: Math.max(0, p.y - 1) }));
    if (k === "s" || k === "S") setCaptorPos(p => ({ ...p, y: Math.min(GRID_SIZE - 1, p.y + 1) }));
    if (k === "a" || k === "A") setCaptorPos(p => ({ ...p, x: Math.max(0, p.x - 1) }));
    if (k === "d" || k === "D") setCaptorPos(p => ({ ...p, x: Math.min(GRID_SIZE - 1, p.x + 1) }));
    if (k === " ") {
      setCaptorPos(p => {
        const ck = `${p.x},${p.y}`;
        setPingCell(ck);
        clearTimeout(pingTimer.current);
        pingTimer.current = setTimeout(() => setPingCell(null), 1500);
        return p;
      });
      e.preventDefault();
    }

    // Navigator arrows
    if (k === "ArrowLeft")  applyNavAction(s => ({ ...s, heading: (s.heading - 15 + 360) % 360 }));
    if (k === "ArrowRight") applyNavAction(s => ({ ...s, heading: (s.heading + 15) % 360 }));
    if (k === "ArrowUp")    applyNavAction(s => ({ ...s, sails: Math.min(100, s.sails + 10) }));
    if (k === "ArrowDown")  applyNavAction(s => ({ ...s, sails: Math.max(0, s.sails - 10) }));
    if (k === "q" || k === "Q") applyNavAction(s => ({ ...s, anchor: !s.anchor }));

    if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(k)) e.preventDefault();
  }, [screen, applyNavAction]);

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  // ── Speed derived from sails & anchor ────────────────────────────────────
  useEffect(() => {
    if (ship.anchor) { setShip(s => ({ ...s, speed: 0 })); return; }
    const sp = ship.sails < 25 ? 0 : ship.sails < 50 ? 1 : ship.sails < 80 ? 2 : 3;
    setShip(s => s.speed !== sp ? { ...s, speed: sp } : s);
  }, [ship.sails, ship.anchor]);

  // ── Trust mechanic: open vault when both press simultaneously ────────────
  const handleTrustPress = useCallback((who) => {
    if (screen !== "trust") return;
    if (who === "captain") {
      setCaptainTrusts(true);
      // Give navigator 4s to also press
      clearTimeout(trustWindowTimer.current);
      trustWindowTimer.current = setTimeout(() => {
        setCaptainTrusts(prev => {
          if (prev) { setCaptainTrusts(false); }
          return false;
        });
      }, 4000);
    }
    if (who === "navigator") {
      setNavigatorTrusts(true);
      clearTimeout(trustWindowTimer.current);
      trustWindowTimer.current = setTimeout(() => {
        setNavigatorTrusts(prev => {
          if (prev) { setNavigatorTrusts(false); }
          return false;
        });
      }, 4000);
    }
  }, [screen]);

  // When both trust simultaneously, trigger vault sequence
  useEffect(() => {
    if (captainTrusts && navigatorTrusts) {
      clearTimeout(trustWindowTimer.current);
      setVaultMerging(true);
      setTimeout(() => {
        setScreen("vault");
        setVaultMerging(false);
        setCaptainTrusts(false);
        setNavigatorTrusts(false);
      }, 1200);
    }
  }, [captainTrusts, navigatorTrusts]);

  // Handle trust keys (T = Captain trusts, Y = Navigator trusts)
  useEffect(() => {
    if (screen !== "trust") return;
    const onKey = (e) => {
      if (e.key === "t" || e.key === "T") handleTrustPress("captain");
      if (e.key === "y" || e.key === "Y") handleTrustPress("navigator");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, handleTrustPress]);

  // ── Next stage ────────────────────────────────────────────────────────────
  const goNextStage = useCallback(() => {
    clearInterval(memTimer.current);
    if (stageIdx >= STAGES.length - 1) {
      // Go to trust screen before vault
      setCaptainTrusts(false);
      setNavigatorTrusts(false);
      setVaultMerging(false);
      setScreen("trust");
      return;
    }
    const next = stageIdx + 1;
    setStageIdx(next);
    setScreen("stageIntro");
  }, [stageIdx]);

  // ── Retry stage ───────────────────────────────────────────────────────────
  const retryStage = useCallback(() => {
    clearInterval(memTimer.current);
    clearTimeout(trustWindowTimer.current);
    setCaptainTrusts(false);
    setNavigatorTrusts(false);
    setScreen("stageIntro");
  }, []);

  // ────────────────────────────────────────────────────────────────────────────
  if (screen === "intro") return <IntroScreen onStart={() => setScreen("stageIntro")} />;

  // ── TRUST SCREEN ──────────────────────────────────────────────────────────
  if (screen === "trust") {
    return (
      <div style={{
        position: "fixed", inset: 0, background: "#080603",
        fontFamily: "'Courier New', monospace",
        overflow: "hidden",
      }}>
        <style>{`
          @keyframes trustGlow {
            0%,100% { box-shadow: 0 0 0px rgba(212,164,32,0); }
            50%      { box-shadow: 0 0 40px rgba(212,164,32,0.7); }
          }
          @keyframes trustPulse {
            0%,100% { opacity: 0.35; transform: scale(1); }
            50%      { opacity: 1; transform: scale(1.04); }
          }
          @keyframes vaultReveal {
            0%   { opacity: 0; transform: scale(0.92) translateY(20px); }
            100% { opacity: 1; transform: scale(1) translateY(0); }
          }
          @keyframes mergeCollapse {
            0%   { opacity: 1; clip-path: inset(0 0 0 0); }
            100% { opacity: 0; clip-path: inset(0 50% 0 50%); }
          }
        `}</style>

        {/* Split trust layout */}
        <div style={{
          display: "flex", width: "100%", height: "100%",
          animation: vaultMerging ? "mergeCollapse 1.2s ease-in forwards" : "none",
        }}>

          {/* Captain side */}
          <div style={{
            flex: "0 0 50%", height: "100%",
            background: "linear-gradient(160deg, #1a1208 0%, #0d1a12 100%)",
            borderRight: "1px solid #3A2E12",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 32,
            position: "relative",
          }}>
            {/* Ambient particle dots */}
            {[...Array(12)].map((_, i) => (
              <div key={i} style={{
                position: "absolute",
                left: `${10 + (i * 7) % 80}%`,
                top: `${15 + (i * 13) % 70}%`,
                width: 2, height: 2, borderRadius: "50%",
                background: captainTrusts ? "#D4A420" : "#2A2010",
                transition: "background 0.4s",
                animation: captainTrusts ? `trustPulse ${1.2 + i * 0.1}s ease-in-out infinite` : "none",
                animationDelay: `${i * 0.08}s`,
              }} />
            ))}

            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 9, letterSpacing: 5, color: "#3A2E12", marginBottom: 12 }}>CAPTAIN</div>
              <div style={{
                fontSize: 28, color: captainTrusts ? "#D4A420" : "#5C4A1E",
                letterSpacing: 2, lineHeight: 1.3, marginBottom: 8,
                transition: "color 0.4s, text-shadow 0.4s",
                textShadow: captainTrusts ? "0 0 30px rgba(212,164,32,0.5)" : "none",
              }}>
                {captainTrusts ? "I TRUST YOU" : "Do you trust\nyour Navigator?"}
              </div>
              <div style={{ fontSize: 10, color: "#3A2E12", letterSpacing: 1, lineHeight: 1.7, whiteSpace: "pre-line" }}>
                {captainTrusts
                  ? "Waiting for the Navigator..."
                  : "Six stages. You've heard their voice.\nYou've felt them steer true."}
              </div>
            </div>

            <button
              onClick={() => handleTrustPress("captain")}
              disabled={captainTrusts}
              style={{
                padding: "16px 48px",
                background: captainTrusts ? "rgba(212,164,32,0.12)" : "transparent",
                border: `2px solid ${captainTrusts ? "#D4A420" : "#5C4A1E"}`,
                color: captainTrusts ? "#D4A420" : "#5C4A1E",
                fontFamily: "'Courier New', monospace",
                fontSize: 11, letterSpacing: 4, cursor: captainTrusts ? "default" : "pointer",
                transition: "all 0.3s",
                animation: captainTrusts ? "trustGlow 1.5s ease-in-out infinite" : "none",
              }}
              onMouseEnter={e => { if (!captainTrusts) { e.target.style.background = "rgba(212,164,32,0.08)"; e.target.style.borderColor = "#8B7340"; e.target.style.color = "#8B7340"; }}}
              onMouseLeave={e => { if (!captainTrusts) { e.target.style.background = "transparent"; e.target.style.borderColor = "#5C4A1E"; e.target.style.color = "#5C4A1E"; }}}
            >
              {captainTrusts ? "✦ TRUST GIVEN" : "[ T ] — I TRUST YOU"}
            </button>

            <div style={{ fontSize: 9, color: "#2A2010", letterSpacing: 2 }}>PRESS T ON KEYBOARD</div>
          </div>

          {/* Divider */}
          <div style={{
            width: 3,
            background: vaultMerging
              ? "linear-gradient(to bottom, #D4A420, #C8961E, #D4A420)"
              : "linear-gradient(to bottom, transparent, #5C4A1E 20%, #8B7340 50%, #5C4A1E 80%, transparent)",
            boxShadow: vaultMerging ? "0 0 20px rgba(212,164,32,0.8)" : "0 0 12px rgba(139,115,64,0.3)",
            transition: "all 0.4s",
            flexShrink: 0,
            zIndex: 10,
          }} />

          {/* Navigator side */}
          <div style={{
            flex: "0 0 50%", height: "100%",
            background: "linear-gradient(170deg, #110D08 0%, #1A1008 100%)",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 32,
            position: "relative",
          }}>
            {[...Array(12)].map((_, i) => (
              <div key={i} style={{
                position: "absolute",
                left: `${5 + (i * 9) % 85}%`,
                top: `${20 + (i * 11) % 65}%`,
                width: 2, height: 2, borderRadius: "50%",
                background: navigatorTrusts ? "#D4A420" : "#2A2010",
                transition: "background 0.4s",
                animation: navigatorTrusts ? `trustPulse ${1.3 + i * 0.09}s ease-in-out infinite` : "none",
                animationDelay: `${i * 0.07}s`,
              }} />
            ))}

            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 9, letterSpacing: 5, color: "#3A2E12", marginBottom: 12 }}>NAVIGATOR</div>
              <div style={{
                fontSize: 28, color: navigatorTrusts ? "#D4A420" : "#5C4A1E",
                letterSpacing: 2, lineHeight: 1.3, marginBottom: 8,
                transition: "color 0.4s, text-shadow 0.4s",
                textShadow: navigatorTrusts ? "0 0 30px rgba(212,164,32,0.5)" : "none",
              }}>
                {navigatorTrusts ? "I TRUST YOU" : "Do you trust\nyour Captain?"}
              </div>
              <div style={{ fontSize: 10, color: "#3A2E12", letterSpacing: 1, lineHeight: 1.7, whiteSpace: "pre-line" }}>
                {navigatorTrusts
                  ? "Waiting for the Captain..."
                  : "Six seas. They described every reef.\nThey never let you run aground."}
              </div>
            </div>

            <button
              onClick={() => handleTrustPress("navigator")}
              disabled={navigatorTrusts}
              style={{
                padding: "16px 48px",
                background: navigatorTrusts ? "rgba(212,164,32,0.12)" : "transparent",
                border: `2px solid ${navigatorTrusts ? "#D4A420" : "#5C4A1E"}`,
                color: navigatorTrusts ? "#D4A420" : "#5C4A1E",
                fontFamily: "'Courier New', monospace",
                fontSize: 11, letterSpacing: 4, cursor: navigatorTrusts ? "default" : "pointer",
                transition: "all 0.3s",
                animation: navigatorTrusts ? "trustGlow 1.5s ease-in-out infinite" : "none",
              }}
              onMouseEnter={e => { if (!navigatorTrusts) { e.target.style.background = "rgba(212,164,32,0.08)"; e.target.style.borderColor = "#8B7340"; e.target.style.color = "#8B7340"; }}}
              onMouseLeave={e => { if (!navigatorTrusts) { e.target.style.background = "transparent"; e.target.style.borderColor = "#5C4A1E"; e.target.style.color = "#5C4A1E"; }}}
            >
              {navigatorTrusts ? "✦ TRUST GIVEN" : "[ Y ] — I TRUST YOU"}
            </button>

            <div style={{ fontSize: 9, color: "#2A2010", letterSpacing: 2 }}>PRESS Y ON KEYBOARD</div>
          </div>
        </div>

        {/* Center instruction (shows until one presses) */}
        {!captainTrusts && !navigatorTrusts && (
          <div style={{
            position: "absolute", top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 20, textAlign: "center",
            background: "#080603", padding: "12px 20px",
            border: "1px solid #2A2010",
          }}>
            <div style={{ fontSize: 9, color: "#3A2E12", letterSpacing: 3, lineHeight: 2 }}>
              NO COUNTDOWN<br />NO HINT<br />JUST FEEL READY TOGETHER
            </div>
          </div>
        )}

        {/* When one has pressed — show "waiting" pulse */}
        {(captainTrusts || navigatorTrusts) && !(captainTrusts && navigatorTrusts) && (
          <div style={{
            position: "absolute", bottom: 32, left: "50%", transform: "translateX(-50%)",
            zIndex: 20, textAlign: "center",
          }}>
            <div style={{
              fontSize: 10, color: "#8B7340", letterSpacing: 3,
              animation: "trustPulse 1.2s ease-in-out infinite",
            }}>
              ◆ ONE VOICE HAS SPOKEN ◆
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── VAULT SCREEN (merged finale) ──────────────────────────────────────────
  if (screen === "vault") {
    return (
      <div style={{
        position: "fixed", inset: 0,
        background: "radial-gradient(ellipse at center, #1A1208 0%, #080603 70%)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: 0, fontFamily: "'Courier New', monospace",
        overflow: "hidden",
      }}>
        <style>{`
          @keyframes vaultReveal {
            0%   { opacity: 0; transform: scale(0.88) translateY(28px); }
            100% { opacity: 1; transform: scale(1) translateY(0); }
          }
          @keyframes goldShimmer {
            0%   { background-position: -300% center; }
            100% { background-position: 300% center; }
          }
          @keyframes floatUp {
            0%,100% { transform: translateY(0px); }
            50%     { transform: translateY(-8px); }
          }
          @keyframes particleDrift {
            0%   { transform: translateY(0) translateX(0) scale(1); opacity: 0.6; }
            100% { transform: translateY(-60px) translateX(var(--dx, 20px)) scale(0); opacity: 0; }
          }
          @keyframes borderPulse {
            0%,100% { opacity: 0.3; }
            50%     { opacity: 0.9; }
          }
          @keyframes staggerFadeIn {
            from { opacity: 0; transform: translateY(12px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>

        {/* Gold particle field */}
        {[...Array(28)].map((_, i) => (
          <div key={i} style={{
            position: "absolute",
            left: `${Math.random() * 100}%`,
            top: `${20 + Math.random() * 80}%`,
            width: i % 3 === 0 ? 3 : 2,
            height: i % 3 === 0 ? 3 : 2,
            borderRadius: "50%",
            background: i % 4 === 0 ? "#D4A420" : i % 4 === 1 ? "#C8961E" : "#8B7340",
            animation: `particleDrift ${2 + (i * 0.17) % 2}s ease-out infinite`,
            animationDelay: `${(i * 0.13) % 2}s`,
            '--dx': `${(i % 7 - 3) * 8}px`,
            opacity: 0.5,
          }} />
        ))}

        {/* Outer frame */}
        <div style={{
          position: "absolute", inset: 16,
          border: "1px solid #3A2E12",
          animation: "borderPulse 3s ease-in-out infinite",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", inset: 22,
          border: "1px solid #2A2010",
          pointerEvents: "none",
        }} />

        {/* Main vault content */}
        <div style={{
          textAlign: "center", maxWidth: 640, padding: "0 32px",
          animation: "vaultReveal 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 24,
        }}>

          {/* THE SAGA IS COMPLETE */}
          <div style={{
            fontSize: 9, letterSpacing: 7, color: "#5C4A1E",
            animation: "staggerFadeIn 0.6s ease-out 0.3s both",
          }}>
            THE VOYAGE IS COMPLETE
          </div>

          {/* Treasure chest icon */}
          <div style={{
            fontSize: 64, lineHeight: 1,
            animation: "floatUp 4s ease-in-out infinite, staggerFadeIn 0.8s ease-out 0.5s both",
            filter: "drop-shadow(0 0 20px rgba(212,164,32,0.5))",
          }}>
            🏴‍☠️
          </div>

          {/* Title */}
          <div style={{ animation: "staggerFadeIn 0.8s ease-out 0.7s both" }}>
            <div style={{
              fontSize: 48, letterSpacing: 3, lineHeight: 1,
              background: "linear-gradient(90deg, #8B7340, #D4A420, #C8961E, #D4A420, #8B7340)",
              backgroundSize: "300% auto",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              animation: "goldShimmer 4s linear infinite, staggerFadeIn 0.8s ease-out 0.7s both",
              fontWeight: "normal",
            }}>
              Isla del Tesoro
            </div>
            <div style={{
              fontSize: 11, color: "#5C4A1E", letterSpacing: 4, marginTop: 6,
            }}>
              THE TREASURE OF CAPTAIN BLACKWAVE VOSS
            </div>
          </div>

          {/* The vault door — the "merged" visual */}
          <div style={{
            width: "100%", maxWidth: 520,
            border: "1px solid #5C4A1E",
            background: "linear-gradient(135deg, #0D0904 0%, #1A1208 50%, #0D0904 100%)",
            padding: "28px 32px",
            position: "relative",
            animation: "staggerFadeIn 0.8s ease-out 1s both",
          }}>
            {/* Corner ornaments */}
            {["top:0;left:0","top:0;right:0","bottom:0;left:0","bottom:0;right:0"].map((pos, i) => (
              <div key={i} style={{
                position: "absolute", ...Object.fromEntries(pos.split(";").map(p => p.split(":"))),
                width: 12, height: 12,
                borderTop: i < 2 ? "2px solid #8B7340" : "none",
                borderBottom: i >= 2 ? "2px solid #8B7340" : "none",
                borderLeft: i % 2 === 0 ? "2px solid #8B7340" : "none",
                borderRight: i % 2 === 1 ? "2px solid #8B7340" : "none",
              }} />
            ))}

            <div style={{ fontSize: 10, color: "#5C4A1E", letterSpacing: 3, marginBottom: 16, textAlign: "center" }}>
              CAPTAIN'S CHART MEETS THE HELM — FOR THE FIRST TIME
            </div>

            {/* Merged map + helm symbolic strip */}
            <div style={{
              display: "flex", gap: 0,
              border: "1px solid #3A2E12",
              overflow: "hidden",
              marginBottom: 20,
            }}>
              {/* Left: Captain's map miniature */}
              <div style={{
                flex: 1, padding: "12px 10px",
                background: "linear-gradient(160deg, #1a1208 0%, #0d1a12 100%)",
                borderRight: "1px solid #3A2E12",
              }}>
                <div style={{ fontSize: 8, letterSpacing: 3, color: "#3A2E12", marginBottom: 8 }}>CAPTAIN'S CHART</div>
                <div style={{
                  display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 1,
                }}>
                  {["sea","sea","reef","sea","sea","island",
                    "sea","current","sea","sea","reef","sea",
                    "reef","sea","sea","dest","sea","sea",
                    "sea","sea","current","sea","island","sea",
                  ].map((t, i) => (
                    <div key={i} style={{
                      height: 8,
                      background: t === "reef" ? "#4A1A1A" : t === "island" ? "#2A4020" : t === "current" ? "#1A2A3A" : t === "dest" ? "#7B5E2A" : "transparent",
                      border: "1px solid rgba(92,74,30,0.15)",
                    }} />
                  ))}
                </div>
                <div style={{ fontSize: 7, color: "#2A2010", marginTop: 6, letterSpacing: 1 }}>⚓ FULL VISIBILITY RESTORED</div>
              </div>
              {/* Right: Navigator's compass miniature */}
              <div style={{
                flex: 1, padding: "12px 10px",
                background: "linear-gradient(170deg, #110D08 0%, #1A1008 100%)",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
              }}>
                <div style={{ fontSize: 8, letterSpacing: 3, color: "#3A2E12", marginBottom: 2 }}>HELM CONTROLS</div>
                <div style={{
                  width: 36, height: 36, borderRadius: "50%",
                  border: "2px solid #5C4A1E",
                  background: "radial-gradient(circle, #2A1F0C, #0D0904)",
                  position: "relative", display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <div style={{
                    position: "absolute", width: 2, height: 13, background: "#CC3333",
                    bottom: "50%", left: "calc(50% - 1px)", borderRadius: 1,
                    transform: "rotate(45deg)",
                    transformOrigin: "bottom center",
                  }} />
                  <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#D4A420" }} />
                </div>
                <div style={{ fontSize: 7, color: "#2A2010", letterSpacing: 1 }}>⚓ ANCHOR DROPPED</div>
              </div>
            </div>

            {/* The story */}
            <div style={{
              fontSize: 11, color: "#5C4A1E", lineHeight: 2, textAlign: "left",
              borderLeft: "2px solid #3A2E12", paddingLeft: 16,
            }}>
              Six stages. Six seas. You sailed them as one.<br />
              The blind found their eyes in a voice.<br />
              The mute found their words in a hand on the helm.<br /><br />
              <span style={{ color: "#8B7340" }}>
                When you both said <em>I trust you</em> —<br />
                the vault opened by itself.
              </span>
            </div>
          </div>

          {/* Stage badges */}
          <div style={{
            display: "flex", gap: 10, alignItems: "center",
            animation: "staggerFadeIn 0.6s ease-out 1.4s both",
          }}>
            {STAGES.map((s, i) => (
              <div key={s.id} style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
              }}>
                <div style={{
                  width: 14, height: 14, borderRadius: "50%",
                  background: "#D4A420",
                  border: "1px solid #5C4A1E",
                  boxShadow: "0 0 8px rgba(212,164,32,0.7)",
                  animation: `floatUp ${2 + i * 0.15}s ease-in-out infinite`,
                  animationDelay: `${i * 0.2}s`,
                }} />
                <div style={{ fontSize: 7, color: "#3A2E12", letterSpacing: 1 }}>{s.id}</div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div style={{
            display: "flex", gap: 12,
            animation: "staggerFadeIn 0.6s ease-out 1.8s both",
          }}>
            <button
              onClick={() => { setStageIdx(0); setCaptainTrusts(false); setNavigatorTrusts(false); setScreen("intro"); }}
              style={{
                padding: "12px 36px", background: "transparent",
                border: "1px solid #5C4A1E", color: "#5C4A1E",
                fontFamily: "'Courier New', monospace", fontSize: 10, letterSpacing: 4, cursor: "pointer",
                transition: "all 0.2s",
              }}
              onMouseEnter={e => { e.target.style.background = "rgba(92,74,30,0.15)"; e.target.style.borderColor = "#8B7340"; e.target.style.color = "#8B7340"; }}
              onMouseLeave={e => { e.target.style.background = "transparent"; e.target.style.borderColor = "#5C4A1E"; e.target.style.color = "#5C4A1E"; }}
            >
              SAIL AGAIN
            </button>
            <button
              onClick={() => { setCaptainTrusts(false); setNavigatorTrusts(false); setScreen("trust"); }}
              style={{
                padding: "12px 36px", background: "transparent",
                border: "1px solid #3A2E12", color: "#3A2E12",
                fontFamily: "'Courier New', monospace", fontSize: 10, letterSpacing: 4, cursor: "pointer",
                transition: "all 0.2s",
              }}
              onMouseEnter={e => { e.target.style.background = "rgba(58,46,18,0.15)"; e.target.style.color = "#5C4A1E"; }}
              onMouseLeave={e => { e.target.style.background = "transparent"; e.target.style.color = "#3A2E12"; }}
            >
              BACK TO VAULT
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Game screen (stageIntro / playing / stageComplete / gameover overlay) ──
  return (
    <div style={{
      width: "100vw", height: "100vh",
      display: "flex", overflow: "hidden",
      fontFamily: "'Courier New', monospace",
      background: "#080603",
      position: "relative",
    }}>
      <style>{`
        @keyframes pingFade {
          0%   { opacity:1; transform:scale(1); }
          100% { opacity:0; transform:scale(1.4); }
        }
        @keyframes damageFlash {
          0%   { opacity:1; }
          100% { opacity:0; }
        }
        @keyframes rainScroll {
          from { background-position: 0 0; }
          to   { background-position: 40px 80px; }
        }
        @keyframes trustGlow {
          0%   { box-shadow: 0 0 0px rgba(212,164,32,0); }
          50%  { box-shadow: 0 0 30px rgba(212,164,32,0.6); }
          100% { box-shadow: 0 0 0px rgba(212,164,32,0); }
        }
        @keyframes trustPulse {
          0%   { opacity: 0.4; transform: scale(1); }
          50%  { opacity: 1;   transform: scale(1.05); }
          100% { opacity: 0.4; transform: scale(1); }
        }
        @keyframes mergeLeft {
          from { transform: translateX(0); opacity: 1; }
          to   { transform: translateX(-50%); opacity: 0; }
        }
        @keyframes mergeRight {
          from { transform: translateX(0); opacity: 1; }
          to   { transform: translateX(50%); opacity: 0; }
        }
        @keyframes vaultReveal {
          0%   { opacity: 0; transform: scale(0.92) translateY(20px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes goldShimmer {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes floatUp {
          0%   { transform: translateY(0px); }
          50%  { transform: translateY(-6px); }
          100% { transform: translateY(0px); }
        }
        @keyframes coinSpin {
          from { transform: rotateY(0deg); }
          to   { transform: rotateY(360deg); }
        }
        * { box-sizing:border-box; }
        button:active { opacity:0.7; }
        ::-webkit-scrollbar { display:none; }
      `}</style>

      {/* Divider */}
      <div style={{
        position: "absolute", top: 0, bottom: 0, left: "58%", width: 3,
        background: "linear-gradient(to bottom, transparent, #5C4A1E 20%, #8B7340 50%, #5C4A1E 80%, transparent)",
        zIndex: 10, pointerEvents: "none",
        boxShadow: "0 0 12px rgba(139,115,64,0.3)",
      }} />

      <CaptainPanel
        ship={ship}
        pingCell={pingCell}
        captorPos={captorPos}
        stage={stage}
        mapData={mapData}
        memoryHidden={memoryHidden}
        memoryCountdown={memoryCountdown}
      />

      <NavigatorPanel
        ship={ship}
        stage={stage}
        onSteer={(dir) => applyNavAction(s => ({
          ...s, heading: dir === "left" ? (s.heading - 15 + 360) % 360 : (s.heading + 15) % 360,
        }))}
        onSails={(dir) => applyNavAction(s => ({
          ...s, sails: dir === "up" ? Math.min(100, s.sails + 10) : Math.max(0, s.sails - 10),
        }))}
        onAnchor={() => applyNavAction(s => ({ ...s, anchor: !s.anchor }))}
        stageIndex={stageIdx}
        memoryHidden={memoryHidden}
      />

      {/* Damage flash overlay */}
      <DamageFlash active={damageFlash} />

      {/* Stage overlays */}
      {screen === "stageIntro" && (
        <StageIntroCard
          stage={stage}
          onBegin={beginStage}
          memoryCountdown={memoryCountdown}
        />
      )}
      {screen === "stageComplete" && (
        <StageCompleteCard
          stage={stage}
          onNext={goNextStage}
          isLastStage={stageIdx === STAGES.length - 1}
        />
      )}
      {screen === "gameover" && (
        <GameOverScreen stage={stage} onRetry={retryStage} />
      )}
    </div>
  );
}
