"use client";

import { useEffect, useRef, useState, useCallback } from "react";

// ─── SHIP STATE (shared between both panels) ────────────────────────────────
const INITIAL_SHIP = {
  x: 2,          // grid col
  y: 2,          // grid row
  heading: 0,    // degrees (0=North, 90=East, 180=South, 270=West)
  speed: 0,      // 0-3
  sails: 0,      // 0-100 %
  hullHP: 3,     // lives
  anchor: false,
  windDir: 45,   // degrees
  windSpeed: 12, // knots
};

// ─── MAP DATA ───────────────────────────────────────────────────────────────
const GRID_SIZE = 12;

const MAP_CELLS = (() => {
  const cells = {};
  const reefs   = [[1,3],[2,5],[4,2],[5,7],[7,4],[8,9],[10,3],[11,6]];
  const islands  = [[3,8],[9,2],[6,5]];
  const currents = [[2,7],[3,4],[7,8],[10,7]];
  const DEST     = [9, 9];

  reefs.forEach(([c,r])    => { cells[`${c},${r}`] = "reef";    });
  islands.forEach(([c,r])  => { cells[`${c},${r}`] = "island";  });
  currents.forEach(([c,r]) => { cells[`${c},${r}`] = "current"; });
  cells[`${DEST[0]},${DEST[1]}`] = "destination";
  return cells;
})();

const LANDMARKS = {
  "3,8":  "Skull Rock",
  "9,2":  "Twin Peaks",
  "6,5":  "The Serpent's Spine",
  "9,9":  "Isla del Tesoro",
};

// ─── COMPASS HELPER ─────────────────────────────────────────────────────────
function headingLabel(deg) {
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

// ────────────────────────────────────────────────────────────────────────────
//  CAPTAIN'S MAP PANEL
// ────────────────────────────────────────────────────────────────────────────
function CaptainPanel({ ship, pingCell, highlightedCell }) {
  const CELL = 48;

  function cellColor(type) {
    switch (type) {
      case "reef":        return "#8B3A3A";
      case "island":      return "#4A6741";
      case "current":     return "#2A4A6B";
      case "destination": return "#7B5E2A";
      default:            return "transparent";
    }
  }

  function cellIcon(type) {
    switch (type) {
      case "reef":        return "⚡";
      case "island":      return "⛰";
      case "current":     return "〜";
      case "destination": return "✦";
      default:            return "";
    }
  }

  return (
    <div style={{
      flex: "0 0 58%",
      background: "linear-gradient(160deg, #1a1208 0%, #0d1a12 60%, #0a1018 100%)",
      borderRight: "3px solid #5C4A1E",
      display: "flex",
      flexDirection: "column",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Parchment noise overlay */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.07'/%3E%3C/svg%3E")`,
        opacity: 0.6, zIndex: 1,
      }} />

      {/* Header */}
      <div style={{
        padding: "16px 24px 12px",
        borderBottom: "1px solid #3A2E12",
        display: "flex", alignItems: "center", gap: 12, zIndex: 2,
      }}>
        <span style={{ fontSize: 11, letterSpacing: 4, color: "#8B7340", fontFamily: "'Courier New', monospace", textTransform: "uppercase" }}>
          CAPTAIN'S CHART
        </span>
        <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, #5C4A1E, transparent)" }} />
        <span style={{ fontSize: 10, color: "#5C4A1E", fontFamily: "'Courier New', monospace" }}>
          [W A S D] — ping / mark
        </span>
      </div>

      {/* Map grid */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 2 }}>
        <div style={{ position: "relative" }}>
          {/* Grid lines backdrop */}
          <div style={{
            position: "absolute", inset: -1,
            background: "radial-gradient(ellipse at center, rgba(92,74,30,0.15) 0%, transparent 70%)",
            pointerEvents: "none",
          }} />

          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(${GRID_SIZE}, ${CELL}px)`,
            gridTemplateRows:    `repeat(${GRID_SIZE}, ${CELL}px)`,
            border: "2px solid #3A2E12",
            boxShadow: "0 0 40px rgba(92,74,30,0.3), inset 0 0 60px rgba(0,0,0,0.5)",
          }}>
            {Array.from({ length: GRID_SIZE }, (_, row) =>
              Array.from({ length: GRID_SIZE }, (_, col) => {
                const key   = `${col},${row}`;
                const type  = MAP_CELLS[key] || "sea";
                const isShip = ship.x === col && ship.y === row;
                const isPing = pingCell === key;
                const isHL   = highlightedCell === key;
                const lmName = LANDMARKS[key];

                return (
                  <div key={key} style={{
                    width: CELL, height: CELL,
                    background: isShip
                      ? "rgba(180,140,40,0.2)"
                      : type !== "sea"
                        ? `${cellColor(type)}33`
                        : (col + row) % 2 === 0 ? "rgba(255,255,255,0.012)" : "transparent",
                    border: "0.5px solid rgba(92,74,30,0.2)",
                    position: "relative",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "background 0.3s",
                    boxShadow: isPing ? `inset 0 0 12px rgba(255,200,50,0.6)` : "none",
                  }}>
                    {/* Cell icon */}
                    {type !== "sea" && (
                      <span style={{ fontSize: 18, opacity: 0.7, userSelect: "none" }}>{cellIcon(type)}</span>
                    )}

                    {/* Landmark label */}
                    {lmName && (
                      <span style={{
                        position: "absolute", bottom: 2, left: 0, right: 0,
                        fontSize: 7, color: "#8B7340", textAlign: "center",
                        fontFamily: "'Courier New', monospace", lineHeight: 1, opacity: 0.8,
                        pointerEvents: "none",
                      }}>{lmName}</span>
                    )}

                    {/* Ship marker */}
                    {isShip && (
                      <div style={{
                        position: "absolute", inset: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <div style={{
                          width: 20, height: 20,
                          background: "#D4A420",
                          clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)",
                          transform: `rotate(${ship.heading}deg)`,
                          transition: "transform 0.4s",
                          filter: "drop-shadow(0 0 6px #D4A420)",
                        }} />
                      </div>
                    )}

                    {/* Ping ring */}
                    {isPing && (
                      <div style={{
                        position: "absolute", inset: -4,
                        border: "2px solid #FFD700",
                        borderRadius: 2,
                        animation: "pingFade 1.5s ease-out forwards",
                        pointerEvents: "none",
                      }} />
                    )}

                    {/* Highlight */}
                    {isHL && !isShip && (
                      <div style={{
                        position: "absolute", inset: 0,
                        background: "rgba(255,215,0,0.15)",
                        border: "1px solid rgba(255,215,0,0.4)",
                      }} />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div style={{
        padding: "10px 24px", borderTop: "1px solid #3A2E12",
        display: "flex", gap: 20, zIndex: 2,
      }}>
        {[["⚡","Reef","#8B3A3A"],["⛰","Island","#4A6741"],["〜","Current","#2A4A6B"],["✦","Destination","#C8961E"]].map(([icon, label, color]) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 12 }}>{icon}</span>
            <span style={{ fontSize: 9, color, fontFamily: "'Courier New', monospace", letterSpacing: 1 }}>{label.toUpperCase()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
//  NAVIGATOR'S CONTROL PANEL
// ────────────────────────────────────────────────────────────────────────────
function NavigatorPanel({ ship, onSteer, onSails, onAnchor }) {
  // Animated compass needle wobble
  const [wobble, setWobble] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setWobble(Math.sin(Date.now() / 600) * 2), 80);
    return () => clearInterval(id);
  }, []);

  const compassAngle = ship.heading + wobble;
  const sailPct = ship.sails;
  const windArrow = ship.windDir;

  return (
    <div style={{
      flex: "0 0 42%",
      background: "linear-gradient(170deg, #110D08 0%, #1A1008 50%, #0E1512 100%)",
      display: "flex", flexDirection: "column",
      position: "relative", overflow: "hidden",
    }}>
      {/* Wood grain texture */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: `repeating-linear-gradient(
          88deg,
          transparent,
          transparent 18px,
          rgba(92,60,20,0.04) 18px,
          rgba(92,60,20,0.04) 19px
        )`,
        zIndex: 1,
      }} />

      {/* Header */}
      <div style={{
        padding: "16px 24px 12px",
        borderBottom: "1px solid #3A2E12",
        display: "flex", alignItems: "center", gap: 12, zIndex: 2,
      }}>
        <span style={{ fontSize: 11, letterSpacing: 4, color: "#8B7340", fontFamily: "'Courier New', monospace", textTransform: "uppercase" }}>
          HELM CONTROLS
        </span>
        <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, #5C4A1E, transparent)" }} />
        <span style={{ fontSize: 10, color: "#5C4A1E", fontFamily: "'Courier New', monospace" }}>
          [↑↓←→] [Q/E]
        </span>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "20px 24px", gap: 20, zIndex: 2 }}>

        {/* ── COMPASS ── */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 9, letterSpacing: 3, color: "#5C4A1E", fontFamily: "'Courier New', monospace" }}>COMPASS</span>
          <div style={{
            position: "relative", width: 140, height: 140,
            borderRadius: "50%",
            background: "radial-gradient(circle at 35% 35%, #2A1F0C, #0D0904)",
            border: "3px solid #5C4A1E",
            boxShadow: "0 0 20px rgba(92,74,30,0.4), inset 0 0 30px rgba(0,0,0,0.6)",
          }}>
            {/* Cardinal marks */}
            {[["N",0],["E",90],["S",180],["W",270]].map(([dir, deg]) => (
              <div key={dir} style={{
                position: "absolute",
                top: "50%", left: "50%",
                transform: `rotate(${deg}deg) translateY(-58px) translateX(-50%)`,
                fontSize: 10, color: dir === "N" ? "#CC3333" : "#8B7340",
                fontFamily: "'Courier New', monospace", fontWeight: "bold",
                lineHeight: 1,
              }}>{dir}</div>
            ))}
            {/* Rose lines */}
            {[0,45,90,135].map(d => (
              <div key={d} style={{
                position: "absolute", top: "50%", left: "50%",
                width: "90%", height: 1,
                background: "rgba(92,74,30,0.3)",
                transform: `translate(-50%, -50%) rotate(${d}deg)`,
              }} />
            ))}
            {/* Needle */}
            <div style={{
              position: "absolute", top: "50%", left: "50%",
              transform: `translate(-50%, -50%) rotate(${compassAngle}deg)`,
              transition: "transform 0.15s",
            }}>
              <div style={{
                width: 4, height: 52, marginLeft: -2, marginTop: -52,
                background: "linear-gradient(to bottom, #CC3333, #882222)",
                borderRadius: "2px 2px 0 0",
              }} />
              <div style={{
                width: 4, height: 38, marginLeft: -2,
                background: "linear-gradient(to bottom, #888, #444)",
                borderRadius: "0 0 2px 2px",
              }} />
            </div>
            {/* Center pin */}
            <div style={{
              position: "absolute", top: "50%", left: "50%",
              width: 8, height: 8, borderRadius: "50%",
              background: "#D4A420",
              transform: "translate(-50%, -50%)",
              boxShadow: "0 0 4px rgba(212,164,32,0.8)",
            }} />
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <span style={{ fontSize: 20, color: "#D4A420", fontFamily: "'Courier New', monospace", fontWeight: "bold" }}>
              {headingLabel(ship.heading)}
            </span>
            <span style={{ fontSize: 12, color: "#5C4A1E", fontFamily: "'Courier New', monospace" }}>
              {Math.round(ship.heading)}°
            </span>
          </div>
        </div>

        {/* ── SAILS ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: 9, letterSpacing: 3, color: "#5C4A1E", fontFamily: "'Courier New', monospace" }}>SAIL DEPLOYMENT</span>
            <span style={{ fontSize: 16, color: "#D4A420", fontFamily: "'Courier New', monospace" }}>{sailPct}%</span>
          </div>
          {/* Sail bar */}
          <div style={{
            height: 16, background: "#0D0904",
            border: "1px solid #3A2E12",
            borderRadius: 2, position: "relative", overflow: "hidden",
          }}>
            <div style={{
              position: "absolute", left: 0, top: 0, bottom: 0,
              width: `${sailPct}%`,
              background: `linear-gradient(90deg, #3A2E12, #8B7340 ${sailPct < 30 ? "100%" : "60%"}, #D4A420)`,
              transition: "width 0.3s",
              boxShadow: sailPct > 0 ? "2px 0 8px rgba(212,164,32,0.4)" : "none",
            }} />
            {/* tick marks */}
            {[25,50,75].map(t => (
              <div key={t} style={{
                position: "absolute", left: `${t}%`, top: 0, bottom: 0,
                width: 1, background: "rgba(92,74,30,0.4)",
              }} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => onSails("down")} style={btnStyle}>▼ Lower [↓]</button>
            <button onClick={() => onSails("up")}   style={btnStyle}>▲ Raise [↑]</button>
          </div>
        </div>

        {/* ── SPEED & WIND ── */}
        <div style={{ display: "flex", gap: 16 }}>
          {/* Speed */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 9, letterSpacing: 3, color: "#5C4A1E", fontFamily: "'Courier New', monospace" }}>SPEED</span>
            <div style={{ display: "flex", gap: 4 }}>
              {[1,2,3].map(i => (
                <div key={i} style={{
                  flex: 1, height: 24,
                  background: ship.speed >= i
                    ? `hsl(${40 - i * 10}, 70%, ${30 + i * 8}%)`
                    : "#0D0904",
                  border: "1px solid #3A2E12",
                  borderRadius: 2,
                  transition: "background 0.3s",
                  boxShadow: ship.speed >= i ? "0 0 6px rgba(212,164,32,0.3)" : "none",
                }} />
              ))}
            </div>
            <span style={{ fontSize: 10, color: "#8B7340", fontFamily: "'Courier New', monospace", textAlign: "center" }}>
              {["DEAD STOP","SLOW","STEADY","FULL SAIL"][ship.speed]}
            </span>
          </div>

          {/* Wind */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 9, letterSpacing: 3, color: "#5C4A1E", fontFamily: "'Courier New', monospace" }}>WIND</span>
            <div style={{
              width: 48, height: 48, borderRadius: "50%",
              border: "1px solid #3A2E12",
              background: "#0D0904",
              position: "relative",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <div style={{
                position: "absolute",
                width: 2, height: 18,
                background: "#4A7FBB",
                transformOrigin: "bottom center",
                bottom: "50%", left: "calc(50% - 1px)",
                transform: `rotate(${windArrow}deg)`,
                borderRadius: 1,
              }} />
              <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#3A2E12" }} />
            </div>
            <span style={{ fontSize: 10, color: "#4A7FBB", fontFamily: "'Courier New', monospace" }}>
              {ship.windSpeed}kn {headingLabel(windArrow)}
            </span>
          </div>
        </div>

        {/* ── STEERING ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 9, letterSpacing: 3, color: "#5C4A1E", fontFamily: "'Courier New', monospace" }}>HELM</span>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button onClick={() => onSteer("left")}  style={{ ...btnStyle, flex: 1 }}>◀ Port [←]</button>
            <button onClick={() => onSteer("right")} style={{ ...btnStyle, flex: 1 }}>Starboard [→] ▶</button>
          </div>
        </div>

        {/* ── HULL & ANCHOR ── */}
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          {/* Hull HP */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 9, letterSpacing: 3, color: "#5C4A1E", fontFamily: "'Courier New', monospace" }}>HULL</span>
            <div style={{ display: "flex", gap: 6 }}>
              {[1,2,3].map(i => (
                <div key={i} style={{
                  width: 24, height: 24, borderRadius: 2,
                  background: ship.hullHP >= i ? "#8B2020" : "#0D0904",
                  border: "1px solid #3A2E12",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12,
                  transition: "background 0.3s",
                  boxShadow: ship.hullHP >= i ? "0 0 6px rgba(139,32,32,0.5)" : "none",
                }}>
                  {ship.hullHP >= i ? "❤" : ""}
                </div>
              ))}
            </div>
          </div>

          {/* Anchor */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 9, letterSpacing: 3, color: "#5C4A1E", fontFamily: "'Courier New', monospace" }}>ANCHOR</span>
            <button onClick={onAnchor} style={{
              ...btnStyle,
              background: ship.anchor ? "rgba(212,164,32,0.2)" : "#0D0904",
              borderColor: ship.anchor ? "#D4A420" : "#3A2E12",
              color: ship.anchor ? "#D4A420" : "#5C4A1E",
            }}>
              ⚓ {ship.anchor ? "DROPPED [Q]" : "RAISED [Q]"}
            </button>
          </div>
        </div>
      </div>

      {/* Stage indicator footer */}
      <div style={{
        padding: "10px 24px",
        borderTop: "1px solid #3A2E12",
        display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 2,
      }}>
        <span style={{ fontSize: 9, letterSpacing: 2, color: "#3A2E12", fontFamily: "'Courier New', monospace" }}>
          STAGE 1 OF 6 — OPEN WATERS
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          {[1,2,3,4,5,6].map(i => (
            <div key={i} style={{
              width: 8, height: 8, borderRadius: "50%",
              background: i === 1 ? "#D4A420" : "#1A1208",
              border: "1px solid #3A2E12",
              boxShadow: i === 1 ? "0 0 4px rgba(212,164,32,0.6)" : "none",
            }} />
          ))}
        </div>
      </div>
    </div>
  );
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

// ────────────────────────────────────────────────────────────────────────────
//  INTRO SCREEN
// ────────────────────────────────────────────────────────────────────────────
function IntroScreen({ onStart }) {
  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "#080603",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 32, zIndex: 100,
      fontFamily: "'Courier New', monospace",
    }}>
      {/* Decorative border */}
      <div style={{
        position: "absolute", inset: 24,
        border: "1px solid #2A2010",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", inset: 28,
        border: "1px solid #1A1408",
        pointerEvents: "none",
      }} />

      <div style={{ textAlign: "center", maxWidth: 560 }}>
        <div style={{ fontSize: 11, letterSpacing: 6, color: "#5C4A1E", marginBottom: 16 }}>
          VOYAGE 01
        </div>
        <h1 style={{
          fontSize: 42, fontWeight: "normal", color: "#C8961E",
          lineHeight: 1.2, margin: "0 0 8px",
          textShadow: "0 0 40px rgba(200,150,30,0.4)",
          letterSpacing: 2,
        }}>
          The Blind Captain
        </h1>
        <h1 style={{
          fontSize: 42, fontWeight: "normal", color: "#8B7340",
          lineHeight: 1.2, margin: "0 0 24px",
          letterSpacing: 2,
        }}>
          & The Mute Navigator
        </h1>
        <p style={{
          color: "#5C4A1E", fontSize: 13, lineHeight: 1.8, letterSpacing: 1,
          borderLeft: "2px solid #3A2E12", paddingLeft: 16, textAlign: "left",
        }}>
          One player sees the map. The other controls the ship.<br />
          Neither can do anything alone.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr",
          gap: 1, border: "1px solid #3A2E12", background: "#3A2E12",
        }}>
          {[
            ["CAPTAIN", "Left side", "Sees the map, hazards & destination", "WASD to ping & mark"],
            ["NAVIGATOR", "Right side", "Controls helm, sails & anchor", "Arrow keys + Q to act"],
          ].map(([role, side, desc, keys]) => (
            <div key={role} style={{
              background: "#080603", padding: "20px 24px",
              display: "flex", flexDirection: "column", gap: 6,
            }}>
              <div style={{ fontSize: 9, letterSpacing: 4, color: "#C8961E" }}>{role}</div>
              <div style={{ fontSize: 11, color: "#5C4A1E" }}>{side} of screen</div>
              <div style={{ fontSize: 11, color: "#3A2E12", lineHeight: 1.5 }}>{desc}</div>
              <div style={{ fontSize: 10, color: "#8B7340", marginTop: 4 }}>{keys}</div>
            </div>
          ))}
        </div>

        <button
          onClick={onStart}
          style={{
            marginTop: 8,
            padding: "14px 48px",
            background: "transparent",
            border: "1px solid #C8961E",
            color: "#C8961E",
            fontFamily: "'Courier New', monospace",
            fontSize: 12, letterSpacing: 4,
            cursor: "pointer",
            transition: "all 0.2s",
          }}
          onMouseEnter={e => { e.target.style.background = "rgba(200,150,30,0.1)"; e.target.style.boxShadow = "0 0 20px rgba(200,150,30,0.2)"; }}
          onMouseLeave={e => { e.target.style.background = "transparent"; e.target.style.boxShadow = "none"; }}
        >
          SET SAIL
        </button>
      </div>

      <div style={{ fontSize: 9, color: "#2A2010", letterSpacing: 2 }}>
        PHASE 1 — SPLIT SCREEN FOUNDATION
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
//  MAIN GAME
// ────────────────────────────────────────────────────────────────────────────
export default function BlindCaptainGame() {
  const [started,    setStarted]    = useState(false);
  const [ship,       setShip]       = useState(INITIAL_SHIP);
  const [pingCell,   setPingCell]   = useState(null);
  const [hlCell,     setHlCell]     = useState(null);
  const [captorPos,  setCaptorPos]  = useState({ x: 2, y: 2 }); // captain's cursor
  const pingTimer = useRef(null);

  // ── Keyboard handler ──────────────────────────────────────────────────────
  const handleKey = useCallback((e) => {
    if (!started) return;
    const key = e.key;

    // CAPTAIN controls (WASD)
    if (key === "w" || key === "W") setCaptorPos(p => ({ ...p, y: Math.max(0, p.y - 1) }));
    if (key === "s" || key === "S") setCaptorPos(p => ({ ...p, y: Math.min(GRID_SIZE-1, p.y + 1) }));
    if (key === "a" || key === "A") setCaptorPos(p => ({ ...p, x: Math.max(0, p.x - 1) }));
    if (key === "d" || key === "D") setCaptorPos(p => ({ ...p, x: Math.min(GRID_SIZE-1, p.x + 1) }));
    if (key === " ") {
      // Space: ping current cursor
      setCaptorPos(p => {
        const k = `${p.x},${p.y}`;
        setPingCell(k);
        clearTimeout(pingTimer.current);
        pingTimer.current = setTimeout(() => setPingCell(null), 1500);
        return p;
      });
      e.preventDefault();
    }

    // NAVIGATOR controls (Arrow keys)
    if (key === "ArrowLeft")  setShip(s => ({ ...s, heading: (s.heading - 15 + 360) % 360 }));
    if (key === "ArrowRight") setShip(s => ({ ...s, heading: (s.heading + 15) % 360 }));
    if (key === "ArrowUp")    setShip(s => ({ ...s, sails: Math.min(100, s.sails + 10) }));
    if (key === "ArrowDown")  setShip(s => ({ ...s, sails: Math.max(0,   s.sails - 10) }));
    if (key === "q" || key === "Q") setShip(s => ({ ...s, anchor: !s.anchor }));

    // Prevent scrolling
    if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(key)) e.preventDefault();
  }, [started]);

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  // Update ship's speed based on sails & anchor
  useEffect(() => {
    if (ship.anchor) { setShip(s => ({ ...s, speed: 0 })); return; }
    const sp = ship.sails < 25 ? 0 : ship.sails < 50 ? 1 : ship.sails < 80 ? 2 : 3;
    setShip(s => s.speed !== sp ? { ...s, speed: sp } : s);
  }, [ship.sails, ship.anchor]);

  if (!started) return <IntroScreen onStart={() => setStarted(true)} />;

  return (
    <div style={{
      width: "100vw", height: "100vh",
      display: "flex", overflow: "hidden",
      fontFamily: "'Courier New', monospace",
      background: "#080603",
    }}>
      <style>{`
        @keyframes pingFade {
          0%   { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.3); }
        }
        * { box-sizing: border-box; }
        button:active { opacity: 0.7; }
        ::-webkit-scrollbar { display: none; }
      `}</style>

      {/* Divider glow */}
      <div style={{
        position: "absolute", top: 0, bottom: 0,
        left: "58%", width: 3,
        background: "linear-gradient(to bottom, transparent, #5C4A1E 20%, #8B7340 50%, #5C4A1E 80%, transparent)",
        zIndex: 10, pointerEvents: "none",
        boxShadow: "0 0 12px rgba(139,115,64,0.4)",
      }} />

      <CaptainPanel
        ship={ship}
        pingCell={pingCell}
        highlightedCell={hlCell}
        captorPos={captorPos}
      />

      <NavigatorPanel
        ship={ship}
        onSteer={(dir) => setShip(s => ({
          ...s,
          heading: dir === "left"
            ? (s.heading - 15 + 360) % 360
            : (s.heading + 15) % 360,
        }))}
        onSails={(dir) => setShip(s => ({
          ...s,
          sails: dir === "up" ? Math.min(100, s.sails + 10) : Math.max(0, s.sails - 10),
        }))}
        onAnchor={() => setShip(s => ({ ...s, anchor: !s.anchor }))}
      />
    </div>
  );
}
