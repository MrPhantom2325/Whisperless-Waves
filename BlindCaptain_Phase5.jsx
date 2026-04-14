"use client";

import { useEffect, useRef, useState, useCallback } from "react";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const GRID_SIZE = 12;
const MOVE_INTERVAL = 420;

// ═══════════════════════════════════════════════════════════════════════════════
//  AUDIO ENGINE  (Web Audio API — no external files needed)
// ═══════════════════════════════════════════════════════════════════════════════
function createAudioEngine() {
  let ctx = null;
  let masterGain = null;
  let waveNode = null;
  let thunderTimeout = null;
  let muted = false;

  function boot() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.55;
    masterGain.connect(ctx.destination);
  }

  // ── low-level helpers ──────────────────────────────────────────────────────
  function noise(duration, gainVal, filterFreq = 800) {
    boot();
    const buf = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.value = gainVal;
    src.connect(filter);
    filter.connect(g);
    g.connect(masterGain);
    src.start();
    return { src, gain: g };
  }

  function tone(freq, type, duration, gainVal, fadeOut = true) {
    boot();
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gainVal, ctx.currentTime);
    if (fadeOut)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(g);
    g.connect(masterGain);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  // ── AMBIENT: looping ocean waves (filtered noise) ─────────────────────────
  function startWaves() {
    boot();
    if (waveNode) return;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const lpf = ctx.createBiquadFilter();
    lpf.type = "lowpass";
    lpf.frequency.value = 420;

    // Slow LFO for wave swell
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.18;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain);
    lfoGain.connect(lpf.frequency);
    lfo.start();

    const g = ctx.createGain();
    g.gain.value = 0.12;

    src.connect(lpf);
    lpf.connect(g);
    g.connect(masterGain);
    src.start();
    waveNode = { src, lfo, gain: g };
  }

  function stopWaves() {
    if (!waveNode) return;
    try {
      waveNode.src.stop();
      waveNode.lfo.stop();
    } catch {}
    waveNode = null;
  }

  // ── STORM: intensify waves + add rain noise ────────────────────────────────
  function setStormIntensity(active) {
    if (!waveNode) return;
    const target = active ? 0.28 : 0.12;
    waveNode.gain.gain.setTargetAtTime(target, ctx.currentTime, 1.2);
  }

  // ── THUNDER: deep boom ────────────────────────────────────────────────────
  function playThunder() {
    boot();
    // rumble with noise + low sine
    noise(2.8, 0.55, 180);
    tone(38, "sine", 2.2, 0.18, true);
    tone(55, "sine", 1.4, 0.09, true);
  }

  function scheduleThunder(active) {
    clearTimeout(thunderTimeout);
    if (!active) return;
    function loop() {
      const delay = 6000 + Math.random() * 14000;
      thunderTimeout = setTimeout(() => {
        playThunder();
        loop();
      }, delay);
    }
    loop();
  }

  // ── RAIN: high-frequency noise layer ─────────────────────────────────────
  let rainNodes = null;
  function startRain() {
    if (rainNodes) return;
    boot();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const hpf = ctx.createBiquadFilter();
    hpf.type = "highpass";
    hpf.frequency.value = 3200;
    const g = ctx.createGain();
    g.gain.value = 0.04;
    src.connect(hpf);
    hpf.connect(g);
    g.connect(masterGain);
    src.start();
    rainNodes = { src, gain: g };
  }
  function stopRain() {
    if (!rainNodes) return;
    try {
      rainNodes.src.stop();
    } catch {}
    rainNodes = null;
  }

  // ── HULL CREAK ────────────────────────────────────────────────────────────
  function playCreak() {
    boot();
    // Pitch-shifting creak via two detuned sines + noise burst
    tone(90, "sawtooth", 0.4, 0.06);
    tone(110, "sawtooth", 0.35, 0.04);
    noise(0.3, 0.08, 300);
  }

  // ── COLLISION IMPACT ──────────────────────────────────────────────────────
  function playCollision() {
    boot();
    // Low thud + noise burst
    tone(55, "sine", 0.6, 0.35);
    tone(80, "triangle", 0.4, 0.2);
    noise(0.5, 0.4, 600);
    // Shudder: two more quick hits
    setTimeout(() => noise(0.2, 0.18, 400), 120);
    setTimeout(() => noise(0.15, 0.1, 350), 270);
  }

  // ── SAIL CHANGE ───────────────────────────────────────────────────────────
  function playSailChange() {
    boot();
    noise(0.22, 0.07, 1200);
    tone(220, "sine", 0.18, 0.03);
  }

  // ── ANCHOR ────────────────────────────────────────────────────────────────
  function playAnchor(dropping) {
    boot();
    if (dropping) {
      tone(160, "sawtooth", 0.25, 0.08);
      noise(0.4, 0.15, 500);
    } else {
      tone(220, "sine", 0.3, 0.06);
      noise(0.3, 0.1, 700);
    }
  }

  // ── PING ─────────────────────────────────────────────────────────────────
  function playPing() {
    boot();
    tone(880, "sine", 0.5, 0.07);
    tone(1320, "sine", 0.3, 0.03);
  }

  // ── STAGE FANFARE ─────────────────────────────────────────────────────────
  function playStageComplete() {
    boot();
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => {
      setTimeout(() => tone(f, "sine", 0.5, 0.1), i * 120);
    });
  }

  // ── VAULT CHORD ───────────────────────────────────────────────────────────
  function playVaultOpen() {
    boot();
    [261, 329, 392, 523].forEach((f, i) => {
      setTimeout(() => {
        tone(f, "sine", 3.0, 0.09, true);
      }, i * 80);
    });
  }

  // ── TRUST KEY PRESS ───────────────────────────────────────────────────────
  function playTrustPress() {
    boot();
    tone(440, "sine", 0.8, 0.08);
    tone(660, "sine", 0.6, 0.04);
  }

  // ── MUTE TOGGLE ──────────────────────────────────────────────────────────
  function toggleMute() {
    if (!masterGain) {
      boot();
    }
    muted = !muted;
    masterGain.gain.setTargetAtTime(muted ? 0 : 0.55, ctx.currentTime, 0.2);
    return muted;
  }

  function isMuted() {
    return muted;
  }

  return {
    startWaves,
    stopWaves,
    setStormIntensity,
    startRain,
    stopRain,
    scheduleThunder,
    playCollision,
    playCreak,
    playSailChange,
    playAnchor,
    playPing,
    playStageComplete,
    playVaultOpen,
    playTrustPress,
    toggleMute,
    isMuted,
  };
}

// Single shared instance (created lazily on first user interaction)
let audioEngine = null;
function getAudio() {
  if (!audioEngine) audioEngine = createAudioEngine();
  return audioEngine;
}

// ─── STAGE DEFINITIONS ───────────────────────────────────────────────────────
const STAGES = [
  {
    id: 1,
    name: "Open Waters",
    subtitle: "The horizon is clear. Learn to speak as one.",
    objective: "Navigate to Isla del Tesoro",
    fogRadius: null,
    mapBlur: 0,
    controlLag: 0,
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
    mapBlur: 3,
    controlLag: 300,
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
    fogRadius: 2,
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
    objective:
      "Identify the true Isla del Tesoro — the sirens will mislead you",
    fogRadius: null,
    mapBlur: 0,
    controlLag: 0,
    stormActive: true,
    falseLandmarks: true,
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
    memoryMode: true,
    windSpeed: 15,
    windDir: 315,
    hazardDensity: "low",
  },
];

// ─── MAP LAYOUTS ──────────────────────────────────────────────────────────────
function buildMap(stageId) {
  const cells = {};
  const base = {
    reefs: [
      [1, 3],
      [2, 5],
      [4, 2],
      [5, 7],
      [7, 4],
      [8, 9],
      [10, 3],
      [11, 6],
    ],
    islands: [
      [3, 8],
      [9, 2],
      [6, 5],
    ],
    currents: [
      [2, 7],
      [3, 4],
      [7, 8],
      [10, 7],
    ],
    dest: [9, 9],
  };
  const extra = {
    2: {
      reefs: [
        [2, 2],
        [3, 3],
        [4, 4],
        [5, 5],
        [6, 6],
        [5, 3],
        [3, 6],
        [4, 8],
      ],
    },
    3: {
      reefs: [
        [1, 1],
        [2, 3],
        [3, 6],
        [5, 2],
        [6, 8],
        [8, 4],
        [9, 6],
        [10, 2],
        [11, 8],
      ],
    },
    4: {
      reefs: [
        [2, 4],
        [4, 3],
        [5, 6],
        [7, 3],
        [8, 7],
        [10, 5],
      ],
    },
    5: {
      reefs: [
        [1, 5],
        [3, 2],
        [5, 9],
        [7, 6],
        [9, 4],
        [11, 3],
      ],
    },
    6: {
      reefs: [
        [2, 5],
        [4, 2],
        [6, 7],
        [8, 3],
        [10, 6],
      ],
    },
  };
  const r =
    stageId >= 2 && extra[stageId]
      ? [...base.reefs, ...extra[stageId].reefs]
      : base.reefs;
  r.forEach(([c, row]) => {
    cells[`${c},${row}`] = "reef";
  });
  base.islands.forEach(([c, row]) => {
    cells[`${c},${row}`] = "island";
  });
  base.currents.forEach(([c, row]) => {
    cells[`${c},${row}`] = "current";
  });
  cells[`${base.dest[0]},${base.dest[1]}`] = "destination";
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

function makeShip(stage) {
  return {
    x: 1,
    y: 1,
    heading: 0,
    speed: 0,
    sails: 0,
    hullHP: 3,
    anchor: false,
    windDir: stage.windDir,
    windSpeed: stage.windSpeed,
  };
}

function headingLabel(deg) {
  const dirs = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ];
  return dirs[Math.round(deg / 22.5) % 16];
}

function dist(ax, ay, bx, by) {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

function headingToVec(deg) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { dx: Math.round(Math.cos(rad)), dy: Math.round(Math.sin(rad)) };
}

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
//  RAIN LAYER  — rendered as a canvas overlay for performance
// ═══════════════════════════════════════════════════════════════════════════════
function RainCanvas({ active, intensity = 1 }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const drops = useRef([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    function resize() {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    // Initialise drops
    const count = Math.floor(120 * intensity);
    drops.current = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      len: 6 + Math.random() * 10,
      speed: 8 + Math.random() * 14,
      alpha: 0.08 + Math.random() * 0.18,
    }));

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!active) {
        animRef.current = requestAnimationFrame(draw);
        return;
      }
      ctx.strokeStyle = "#6aA0C8";
      ctx.lineWidth = 0.8;
      drops.current.forEach((d) => {
        ctx.globalAlpha = d.alpha;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + d.len * 0.3, d.y + d.len);
        ctx.stroke();
        d.y += d.speed;
        d.x += d.speed * 0.22;
        if (d.y > canvas.height || d.x > canvas.width) {
          d.x = Math.random() * canvas.width;
          d.y = -d.len;
        }
      });
      ctx.globalAlpha = 1;
      animRef.current = requestAnimationFrame(draw);
    }
    draw();

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [active, intensity]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 5,
        opacity: active ? 1 : 0,
        transition: "opacity 1.2s",
      }}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  FOG LAYER  — soft SVG-based animated fog patches
// ═══════════════════════════════════════════════════════════════════════════════
function FogLayer({ active, radius }) {
  if (!active) return null;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 4,
        overflow: "hidden",
      }}
    >
      <style>{`
        @keyframes fogDrift1 { 0%,100% { transform: translateX(0px) translateY(0px); } 50% { transform: translateX(18px) translateY(-8px); } }
        @keyframes fogDrift2 { 0%,100% { transform: translateX(0px) translateY(0px); } 50% { transform: translateX(-14px) translateY(10px); } }
        @keyframes fogDrift3 { 0%,100% { transform: translateX(0px) translateY(0px); } 50% { transform: translateX(10px) translateY(14px); } }
      `}</style>
      {/* Three overlapping fog blobs */}
      {[
        {
          w: "70%",
          h: "45%",
          top: "10%",
          left: "-10%",
          anim: "fogDrift1 9s ease-in-out infinite",
          opacity: 0.07,
        },
        {
          w: "55%",
          h: "40%",
          top: "35%",
          left: "30%",
          anim: "fogDrift2 13s ease-in-out infinite",
          opacity: 0.06,
        },
        {
          w: "60%",
          h: "50%",
          top: "5%",
          left: "50%",
          anim: "fogDrift3 11s ease-in-out infinite",
          opacity: 0.05,
        },
      ].map((blob, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: blob.top,
            left: blob.left,
            width: blob.w,
            height: blob.h,
            background:
              "radial-gradient(ellipse at center, rgba(180,200,220,1) 0%, transparent 70%)",
            opacity: blob.opacity,
            animation: blob.anim,
            filter: "blur(32px)",
          }}
        />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  LIGHTNING FLASH
// ═══════════════════════════════════════════════════════════════════════════════
function LightningFlash({ active }) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      clearTimeout(timerRef.current);
      return;
    }
    function flash() {
      const delay = 5000 + Math.random() * 12000;
      timerRef.current = setTimeout(() => {
        setVisible(true);
        setTimeout(() => {
          setVisible(false);
          setTimeout(() => {
            setVisible(true);
            setTimeout(() => setVisible(false), 60);
          }, 120);
        }, 80);
        flash();
      }, delay);
    }
    flash();
    return () => clearTimeout(timerRef.current);
  }, [active]);

  if (!visible) return null;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 6,
        pointerEvents: "none",
        background: "rgba(180,210,255,0.12)",
      }}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MUTE BUTTON  — fixed top-right
// ═══════════════════════════════════════════════════════════════════════════════
function MuteButton() {
  const [muted, setMuted] = useState(false);
  return (
    <button
      onClick={() => setMuted(getAudio().toggleMute())}
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        zIndex: 200,
        background: "rgba(8,6,3,0.85)",
        border: "1px solid #3A2E12",
        color: muted ? "#3A2E12" : "#8B7340",
        fontFamily: "'Courier New', monospace",
        fontSize: 9,
        letterSpacing: 2,
        padding: "5px 10px",
        cursor: "pointer",
        borderRadius: 2,
      }}
    >
      {muted ? "♪ MUTED" : "♪ SOUND"}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  STAGE INTRO CARD
// ═══════════════════════════════════════════════════════════════════════════════
function StageIntroCard({ stage, onBegin }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 50,
        background: "rgba(8,6,3,0.94)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 28,
        fontFamily: "'Courier New', monospace",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 32,
          border: "1px solid #2A2010",
          pointerEvents: "none",
        }}
      />

      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontSize: 10,
            letterSpacing: 5,
            color: "#3A2E12",
            marginBottom: 12,
          }}
        >
          STAGE {stage.id} OF 6
        </div>
        <div
          style={{
            fontSize: 36,
            color: "#C8961E",
            letterSpacing: 2,
            lineHeight: 1.2,
            marginBottom: 8,
            textShadow: "0 0 30px rgba(200,150,30,0.3)",
          }}
        >
          {stage.name}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "#5C4A1E",
            letterSpacing: 1,
            marginBottom: 24,
            lineHeight: 1.6,
          }}
        >
          {stage.subtitle}
        </div>
        <div
          style={{
            border: "1px solid #2A2010",
            padding: "14px 24px",
            maxWidth: 480,
            textAlign: "left",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div
            style={{
              fontSize: 9,
              letterSpacing: 3,
              color: "#5C4A1E",
              marginBottom: 4,
            }}
          >
            BRIEFING
          </div>
          <div style={{ fontSize: 11, color: "#3A2E12", lineHeight: 1.7 }}>
            {stage.objective}
          </div>
          {stage.stormActive && (
            <div style={{ fontSize: 10, color: "#8B3A3A" }}>
              ⚠ STORM ACTIVE — thunder, rain, blurred charts. Stay calm.
            </div>
          )}
          {stage.fogRadius && (
            <div style={{ fontSize: 10, color: "#4A7FBB" }}>
              ⚠ FOG — visibility limited to {stage.fogRadius} tiles around ship.
            </div>
          )}
          {stage.falseLandmarks && (
            <div style={{ fontSize: 10, color: "#8B3A3A" }}>
              ⚠ DECOYS — two islands mimic the destination. Only one is marked ✦
            </div>
          )}
          {stage.memoryMode && (
            <div style={{ fontSize: 10, color: "#C8961E" }}>
              ⚠ BLACKOUT — 10 seconds to memorise the map. Then darkness.
            </div>
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
          fontSize: 11,
          letterSpacing: 4,
          cursor: "pointer",
        }}
        onMouseEnter={(e) => {
          e.target.style.background = "rgba(200,150,30,0.1)";
        }}
        onMouseLeave={(e) => {
          e.target.style.background = "transparent";
        }}
      >
        {stage.id === 6 ? "BEGIN FINAL STAGE" : "SET SAIL"}
      </button>

      <div style={{ display: "flex", gap: 8 }}>
        {STAGES.map((s) => (
          <div
            key={s.id}
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background:
                s.id === stage.id
                  ? "#D4A420"
                  : s.id < stage.id
                    ? "#3A2E12"
                    : "#1A1208",
              border: "1px solid #3A2E12",
              boxShadow:
                s.id === stage.id ? "0 0 6px rgba(212,164,32,0.6)" : "none",
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CAPTAIN'S MAP PANEL
// ═══════════════════════════════════════════════════════════════════════════════
function CaptainPanel({
  ship,
  pingCell,
  captorPos,
  stage,
  mapData,
  memoryHidden,
  memoryCountdown,
  shakeOffset,
}) {
  const CELL = 44;
  const { cells } = mapData;

  function cellColor(t) {
    return t === "reef"
      ? "#8B3A3A"
      : t === "island"
        ? "#4A6741"
        : t === "current"
          ? "#2A4A6B"
          : "#7B5E2A";
  }
  function cellIcon(t) {
    return t === "reef"
      ? "⚡"
      : t === "island"
        ? "⛰"
        : t === "current"
          ? "〜"
          : "✦";
  }
  const isVisible = (col, row) =>
    !stage.fogRadius || dist(col, row, ship.x, ship.y) <= stage.fogRadius;

  return (
    <div
      style={{
        flex: "0 0 58%",
        background:
          "linear-gradient(160deg, #1a1208 0%, #0d1a12 60%, #0a1018 100%)",
        borderRight: "3px solid #5C4A1E",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
        transform: `translate(${shakeOffset.x}px, ${shakeOffset.y}px)`,
        transition:
          shakeOffset.x === 0 && shakeOffset.y === 0
            ? "transform 0.15s"
            : "none",
      }}
    >
      {/* ── ATMOSPHERE LAYERS ── */}
      <RainCanvas active={stage.stormActive} intensity={1.2} />
      <FogLayer active={!!stage.fogRadius} radius={stage.fogRadius} />
      <LightningFlash active={stage.stormActive} />

      {/* Memory overlay */}
      {memoryHidden && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 20,
            background: "#080603",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              fontSize: 13,
              color: "#3A2E12",
              fontFamily: "'Courier New', monospace",
              letterSpacing: 3,
            }}
          >
            THE MAP IS GONE
          </div>
          <div
            style={{
              fontSize: 10,
              color: "#2A2010",
              fontFamily: "'Courier New', monospace",
              letterSpacing: 2,
              textAlign: "center",
              maxWidth: 260,
              lineHeight: 1.8,
            }}
          >
            Speak from memory.
            <br />
            Guide the Navigator to Isla del Tesoro.
          </div>
        </div>
      )}

      {/* Memory countdown banner */}
      {stage.memoryMode && !memoryHidden && memoryCountdown > 0 && (
        <div
          style={{
            position: "absolute",
            top: 50,
            left: 0,
            right: 0,
            zIndex: 15,
            background: "rgba(200,150,30,0.12)",
            borderTop: "1px solid #C8961E",
            borderBottom: "1px solid #C8961E",
            padding: "6px 24px",
            textAlign: "center",
            fontFamily: "'Courier New', monospace",
            fontSize: 11,
            color: "#C8961E",
            letterSpacing: 2,
          }}
        >
          MEMORISE — BLACKOUT IN {memoryCountdown}s
        </div>
      )}

      {/* Header */}
      <div
        style={{
          padding: "14px 24px 10px",
          borderBottom: "1px solid #3A2E12",
          display: "flex",
          alignItems: "center",
          gap: 12,
          zIndex: 4,
        }}
      >
        <span
          style={{
            fontSize: 10,
            letterSpacing: 4,
            color: "#8B7340",
            fontFamily: "'Courier New', monospace",
          }}
        >
          CAPTAIN'S CHART
        </span>
        <div
          style={{
            flex: 1,
            height: 1,
            background: "linear-gradient(90deg, #5C4A1E, transparent)",
          }}
        />
        {stage.fogRadius && (
          <span
            style={{
              fontSize: 9,
              color: "#4A7FBB",
              fontFamily: "'Courier New', monospace",
            }}
          >
            FOG — {stage.fogRadius} TILE RADIUS
          </span>
        )}
        {stage.stormActive && (
          <span
            style={{
              fontSize: 9,
              color: "#8B3A3A",
              fontFamily: "'Courier New', monospace",
              animation: "stormPulse 1.2s ease-in-out infinite",
            }}
          >
            ⛈ STORM
          </span>
        )}
        <span
          style={{
            fontSize: 9,
            color: "#3A2E12",
            fontFamily: "'Courier New', monospace",
          }}
        >
          [WASD] CURSOR · [SPACE] PING
        </span>
      </div>

      {/* Map */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          zIndex: 2,
          filter: stage.stormActive ? `blur(${stage.mapBlur}px)` : "none",
          transition: "filter 0.8s",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${GRID_SIZE}, ${CELL}px)`,
            gridTemplateRows: `repeat(${GRID_SIZE}, ${CELL}px)`,
            border: "2px solid #3A2E12",
            boxShadow:
              "0 0 40px rgba(92,74,30,0.2), inset 0 0 60px rgba(0,0,0,0.5)",
          }}
        >
          {Array.from({ length: GRID_SIZE }, (_, row) =>
            Array.from({ length: GRID_SIZE }, (_, col) => {
              const key = `${col},${row}`;
              const type = cells[key] || "sea";
              const vis = isVisible(col, row);
              const isShip = ship.x === col && ship.y === row;
              const isCur = captorPos.x === col && captorPos.y === row;
              const isPing = pingCell === key;
              const lmName =
                type === "destination" ? "Isla del Tesoro" : LANDMARKS[key];

              return (
                <div
                  key={key}
                  style={{
                    width: CELL,
                    height: CELL,
                    background: !vis
                      ? "rgba(0,0,0,0.85)"
                      : isShip
                        ? "rgba(180,140,40,0.18)"
                        : type !== "sea"
                          ? `${cellColor(type)}33`
                          : (col + row) % 2 === 0
                            ? "rgba(255,255,255,0.01)"
                            : "transparent",
                    border: "0.5px solid rgba(92,74,30,0.15)",
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "background 0.3s",
                    boxShadow: isPing
                      ? "inset 0 0 14px rgba(255,200,50,0.7)"
                      : "none",
                    overflow: "hidden",
                  }}
                >
                  {vis && type !== "sea" && (
                    <span
                      style={{
                        fontSize: 16,
                        opacity: 0.65,
                        userSelect: "none",
                      }}
                    >
                      {cellIcon(type)}
                    </span>
                  )}
                  {vis && lmName && (
                    <span
                      style={{
                        position: "absolute",
                        bottom: 1,
                        left: 0,
                        right: 0,
                        fontSize: 6,
                        color: type === "decoy" ? "#5C4A1E" : "#8B7340",
                        textAlign: "center",
                        fontFamily: "'Courier New', monospace",
                        lineHeight: 1,
                        opacity: 0.75,
                        pointerEvents: "none",
                      }}
                    >
                      {type === "decoy" ? "???" : lmName}
                    </span>
                  )}
                  {isShip && (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <div
                        style={{
                          width: 18,
                          height: 18,
                          background: "#D4A420",
                          clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)",
                          transform: `rotate(${ship.heading}deg)`,
                          transition: "transform 0.4s",
                          filter: "drop-shadow(0 0 5px #D4A420)",
                        }}
                      />
                    </div>
                  )}
                  {isCur && !isShip && (
                    <div
                      style={{
                        position: "absolute",
                        inset: 2,
                        border: "1px solid rgba(212,164,32,0.5)",
                        borderRadius: 1,
                        pointerEvents: "none",
                      }}
                    />
                  )}
                  {isPing && (
                    <div
                      style={{
                        position: "absolute",
                        inset: -3,
                        border: "2px solid #FFD700",
                        borderRadius: 1,
                        animation: "pingFade 1.5s ease-out forwards",
                        pointerEvents: "none",
                      }}
                    />
                  )}
                  {!vis && (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        background: "rgba(0,0,0,0.85)",
                      }}
                    />
                  )}
                </div>
              );
            }),
          )}
        </div>
      </div>

      {/* Legend */}
      <div
        style={{
          padding: "8px 24px",
          borderTop: "1px solid #3A2E12",
          display: "flex",
          gap: 16,
          zIndex: 2,
          flexWrap: "wrap",
        }}
      >
        {[
          ["⚡", "Reef", "#8B3A3A"],
          ["⛰", "Island", "#4A6741"],
          ["〜", "Current", "#2A4A6B"],
          ["✦", "Destination", "#C8961E"],
        ].map(([icon, label, color]) => (
          <div
            key={label}
            style={{ display: "flex", alignItems: "center", gap: 4 }}
          >
            <span style={{ fontSize: 11 }}>{icon}</span>
            <span
              style={{
                fontSize: 8,
                color,
                fontFamily: "'Courier New', monospace",
                letterSpacing: 1,
              }}
            >
              {label.toUpperCase()}
            </span>
          </div>
        ))}
        {stage.falseLandmarks && (
          <span
            style={{
              fontSize: 8,
              color: "#8B3A3A",
              fontFamily: "'Courier New', monospace",
              letterSpacing: 1,
              marginLeft: "auto",
            }}
          >
            ⚠ DECOYS ACTIVE
          </span>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  NAVIGATOR'S PANEL
// ═══════════════════════════════════════════════════════════════════════════════
function NavigatorPanel({
  ship,
  stage,
  onSteer,
  onSails,
  onAnchor,
  stageIndex,
  memoryHidden,
  shakeOffset,
}) {
  const [wobble, setWobble] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setWobble(Math.sin(Date.now() / 600) * (stage.stormActive ? 6 : 2));
    }, 80);
    return () => clearInterval(id);
  }, [stage.stormActive]);

  const compassAngle = ship.heading + wobble;

  return (
    <div
      style={{
        flex: "0 0 42%",
        background:
          "linear-gradient(170deg, #110D08 0%, #1A1008 50%, #0E1512 100%)",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
        transform: `translate(${shakeOffset.x}px, ${shakeOffset.y}px)`,
        transition:
          shakeOffset.x === 0 && shakeOffset.y === 0
            ? "transform 0.15s"
            : "none",
      }}
    >
      {/* Wood grain */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 1,
          backgroundImage:
            "repeating-linear-gradient(88deg, transparent, transparent 18px, rgba(92,60,20,0.04) 18px, rgba(92,60,20,0.04) 19px)",
        }}
      />

      {/* Rain on navigator side too */}
      <RainCanvas active={stage.stormActive} intensity={0.7} />

      {/* Memory overlay */}
      {memoryHidden && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 20,
            background: "#080603",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              fontSize: 13,
              color: "#3A2E12",
              fontFamily: "'Courier New', monospace",
              letterSpacing: 3,
            }}
          >
            HELM ONLY
          </div>
          <div
            style={{
              fontSize: 10,
              color: "#2A2010",
              fontFamily: "'Courier New', monospace",
              letterSpacing: 1,
              textAlign: "center",
              maxWidth: 200,
              lineHeight: 1.8,
            }}
          >
            Controls still active.
            <br />
            Listen to the Captain.
          </div>
          <div
            style={{
              marginTop: 16,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              fontSize: 10,
              color: "#3A2E12",
              fontFamily: "'Courier New', monospace",
            }}
          >
            <span>← → Steer</span>
            <span>↑ ↓ Sails</span>
            <span>Q Anchor</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div
        style={{
          padding: "14px 24px 10px",
          borderBottom: "1px solid #3A2E12",
          display: "flex",
          alignItems: "center",
          gap: 12,
          zIndex: 2,
        }}
      >
        <span
          style={{
            fontSize: 10,
            letterSpacing: 4,
            color: "#8B7340",
            fontFamily: "'Courier New', monospace",
          }}
        >
          HELM CONTROLS
        </span>
        <div
          style={{
            flex: 1,
            height: 1,
            background: "linear-gradient(90deg, #5C4A1E, transparent)",
          }}
        />
        {stage.controlLag > 0 && (
          <span
            style={{
              fontSize: 9,
              color: "#8B3A3A",
              fontFamily: "'Courier New', monospace",
            }}
          >
            STORM LAG
          </span>
        )}
        <span
          style={{
            fontSize: 9,
            color: "#3A2E12",
            fontFamily: "'Courier New', monospace",
          }}
        >
          [↑↓←→] [Q]
        </span>
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: "16px 20px",
          gap: 16,
          zIndex: 2,
          overflowY: "auto",
        }}
      >
        {/* ── COMPASS ── */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span
            style={{
              fontSize: 9,
              letterSpacing: 3,
              color: "#5C4A1E",
              fontFamily: "'Courier New', monospace",
            }}
          >
            COMPASS
          </span>
          <div
            style={{
              position: "relative",
              width: 130,
              height: 130,
              borderRadius: "50%",
              background:
                "radial-gradient(circle at 35% 35%, #2A1F0C, #0D0904)",
              border: "3px solid #5C4A1E",
              boxShadow:
                "0 0 20px rgba(92,74,30,0.3), inset 0 0 30px rgba(0,0,0,0.6)",
            }}
          >
            {[
              ["N", 0],
              ["E", 90],
              ["S", 180],
              ["W", 270],
            ].map(([dir, deg]) => (
              <div
                key={dir}
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: `rotate(${deg}deg) translateY(-52px) translateX(-50%)`,
                  fontSize: 9,
                  color: dir === "N" ? "#CC3333" : "#8B7340",
                  fontFamily: "'Courier New', monospace",
                  fontWeight: "bold",
                }}
              >
                {dir}
              </div>
            ))}
            {[0, 45, 90, 135].map((d) => (
              <div
                key={d}
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  width: "88%",
                  height: 1,
                  background: "rgba(92,74,30,0.25)",
                  transform: `translate(-50%, -50%) rotate(${d}deg)`,
                }}
              />
            ))}
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: `translate(-50%, -50%) rotate(${compassAngle}deg)`,
                transition: "transform 0.15s",
              }}
            >
              <div
                style={{
                  width: 4,
                  height: 48,
                  marginLeft: -2,
                  marginTop: -48,
                  background: "linear-gradient(to bottom, #CC3333, #882222)",
                  borderRadius: "2px 2px 0 0",
                }}
              />
              <div
                style={{
                  width: 4,
                  height: 34,
                  marginLeft: -2,
                  background: "linear-gradient(to bottom, #888, #444)",
                  borderRadius: "0 0 2px 2px",
                }}
              />
            </div>
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#D4A420",
                transform: "translate(-50%, -50%)",
                boxShadow: "0 0 4px rgba(212,164,32,0.8)",
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span
              style={{
                fontSize: 18,
                color: "#D4A420",
                fontFamily: "'Courier New', monospace",
                fontWeight: "bold",
              }}
            >
              {headingLabel(ship.heading)}
            </span>
            <span
              style={{
                fontSize: 11,
                color: "#5C4A1E",
                fontFamily: "'Courier New', monospace",
              }}
            >
              {Math.round(ship.heading)}°
            </span>
          </div>
        </div>

        {/* ── SAILS ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
            }}
          >
            <span
              style={{
                fontSize: 9,
                letterSpacing: 3,
                color: "#5C4A1E",
                fontFamily: "'Courier New', monospace",
              }}
            >
              SAIL DEPLOYMENT
            </span>
            <span
              style={{
                fontSize: 14,
                color: "#D4A420",
                fontFamily: "'Courier New', monospace",
              }}
            >
              {ship.sails}%
            </span>
          </div>
          <div
            style={{
              height: 14,
              background: "#0D0904",
              border: "1px solid #3A2E12",
              borderRadius: 2,
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: `${ship.sails}%`,
                background: `linear-gradient(90deg, #3A2E12, #8B7340 ${ship.sails < 30 ? "100%" : "60%"}, #D4A420)`,
                transition: "width 0.3s",
              }}
            />
            {[25, 50, 75].map((t) => (
              <div
                key={t}
                style={{
                  position: "absolute",
                  left: `${t}%`,
                  top: 0,
                  bottom: 0,
                  width: 1,
                  background: "rgba(92,74,30,0.4)",
                }}
              />
            ))}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => onSails("down")}
              style={{ ...btnStyle, flex: 1, fontSize: 9 }}
            >
              ▼ LOWER [↓]
            </button>
            <button
              onClick={() => onSails("up")}
              style={{ ...btnStyle, flex: 1, fontSize: 9 }}
            >
              ▲ RAISE [↑]
            </button>
          </div>
        </div>

        {/* ── SPEED & WIND ── */}
        <div style={{ display: "flex", gap: 12 }}>
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: 5,
            }}
          >
            <span
              style={{
                fontSize: 9,
                letterSpacing: 3,
                color: "#5C4A1E",
                fontFamily: "'Courier New', monospace",
              }}
            >
              SPEED
            </span>
            <div style={{ display: "flex", gap: 3 }}>
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: 20,
                    background:
                      ship.speed >= i
                        ? `hsl(${40 - i * 10}, 70%, ${30 + i * 8}%)`
                        : "#0D0904",
                    border: "1px solid #3A2E12",
                    borderRadius: 2,
                    transition: "background 0.3s",
                  }}
                />
              ))}
            </div>
            <span
              style={{
                fontSize: 9,
                color: "#8B7340",
                fontFamily: "'Courier New', monospace",
                textAlign: "center",
              }}
            >
              {["DEAD STOP", "SLOW", "STEADY", "FULL SAIL"][ship.speed]}
            </span>
          </div>
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: 5,
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontSize: 9,
                letterSpacing: 3,
                color: "#5C4A1E",
                fontFamily: "'Courier New', monospace",
              }}
            >
              WIND
            </span>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                border: "1px solid #3A2E12",
                background: "#0D0904",
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  width: 2,
                  height: 16,
                  background: "#4A7FBB",
                  transformOrigin: "bottom center",
                  bottom: "50%",
                  left: "calc(50% - 1px)",
                  transform: `rotate(${ship.windDir}deg)`,
                  borderRadius: 1,
                }}
              />
              <div
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: "50%",
                  background: "#3A2E12",
                }}
              />
            </div>
            <span
              style={{
                fontSize: 9,
                color: "#4A7FBB",
                fontFamily: "'Courier New', monospace",
              }}
            >
              {ship.windSpeed}kn {headingLabel(ship.windDir)}
            </span>
          </div>
        </div>

        {/* ── STEERING ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span
            style={{
              fontSize: 9,
              letterSpacing: 3,
              color: "#5C4A1E",
              fontFamily: "'Courier New', monospace",
            }}
          >
            HELM{stage.controlLag > 0 ? " — SLUGGISH" : ""}
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => onSteer("left")}
              style={{ ...btnStyle, flex: 1, fontSize: 9 }}
            >
              ◀ PORT [←]
            </button>
            <button
              onClick={() => onSteer("right")}
              style={{ ...btnStyle, flex: 1, fontSize: 9 }}
            >
              STBD [→] ▶
            </button>
          </div>
        </div>

        {/* ── HULL & ANCHOR ── */}
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: 5,
            }}
          >
            <span
              style={{
                fontSize: 9,
                letterSpacing: 3,
                color: "#5C4A1E",
                fontFamily: "'Courier New', monospace",
              }}
            >
              HULL
            </span>
            <div style={{ display: "flex", gap: 5 }}>
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 2,
                    background: ship.hullHP >= i ? "#8B2020" : "#0D0904",
                    border: "1px solid #3A2E12",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    transition: "background 0.3s",
                    boxShadow:
                      ship.hullHP >= i ? "0 0 5px rgba(139,32,32,0.5)" : "none",
                  }}
                >
                  {ship.hullHP >= i ? "❤" : ""}
                </div>
              ))}
            </div>
          </div>
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: 5,
            }}
          >
            <span
              style={{
                fontSize: 9,
                letterSpacing: 3,
                color: "#5C4A1E",
                fontFamily: "'Courier New', monospace",
              }}
            >
              ANCHOR
            </span>
            <button
              onClick={() => onAnchor()}
              style={{
                ...btnStyle,
                fontSize: 9,
                background: ship.anchor ? "rgba(212,164,32,0.15)" : "#0D0904",
                borderColor: ship.anchor ? "#D4A420" : "#3A2E12",
                color: ship.anchor ? "#D4A420" : "#5C4A1E",
              }}
            >
              ⚓ {ship.anchor ? "DROPPED [Q]" : "RAISED [Q]"}
            </button>
          </div>
        </div>

        {/* Position readout */}
        <div
          style={{
            borderTop: "1px solid #1A1208",
            paddingTop: 10,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontSize: 9,
              letterSpacing: 2,
              color: "#2A2010",
              fontFamily: "'Courier New', monospace",
            }}
          >
            POSITION
          </span>
          <span
            style={{
              fontSize: 9,
              color: "#3A2E12",
              fontFamily: "'Courier New', monospace",
            }}
          >
            {String.fromCharCode(65 + ship.x)}
            {ship.y + 1}
          </span>
        </div>
      </div>

      {/* Stage footer */}
      <div
        style={{
          padding: "8px 20px",
          borderTop: "1px solid #3A2E12",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          zIndex: 2,
        }}
      >
        <span
          style={{
            fontSize: 8,
            letterSpacing: 2,
            color: "#2A2010",
            fontFamily: "'Courier New', monospace",
          }}
        >
          STAGE {stage.id} — {stage.name.toUpperCase()}
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          {STAGES.map((s) => (
            <div
              key={s.id}
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background:
                  s.id === stage.id
                    ? "#D4A420"
                    : s.id < stage.id
                      ? "#3A2E12"
                      : "#1A1208",
                border: "1px solid #2A2010",
                boxShadow:
                  s.id === stage.id ? "0 0 4px rgba(212,164,32,0.6)" : "none",
              }}
            />
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
    "You weathered the reef maze together.",
    "The storm is past. Your words held the ship true.",
    "Through the fog, you found each other's voice.",
    "The sirens failed. You trusted the right star.",
    "",
  ];
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 50,
        background: "rgba(8,6,3,0.96)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        fontFamily: "'Courier New', monospace",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 32,
          border: "1px solid #2A2010",
          pointerEvents: "none",
        }}
      />
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontSize: 10,
            letterSpacing: 5,
            color: "#5C4A1E",
            marginBottom: 14,
          }}
        >
          STAGE {stage.id} COMPLETE
        </div>
        <div
          style={{
            fontSize: 30,
            color: "#C8961E",
            letterSpacing: 2,
            marginBottom: 12,
            textShadow: "0 0 20px rgba(200,150,30,0.3)",
          }}
        >
          {stage.name}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "#5C4A1E",
            maxWidth: 420,
            lineHeight: 1.8,
            borderLeft: "2px solid #2A2010",
            paddingLeft: 16,
            textAlign: "left",
          }}
        >
          {messages[stage.id - 1]}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {STAGES.map((s) => (
          <div
            key={s.id}
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: s.id <= stage.id ? "#D4A420" : "#1A1208",
              border: "1px solid #3A2E12",
              boxShadow:
                s.id <= stage.id ? "0 0 5px rgba(212,164,32,0.5)" : "none",
            }}
          />
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
          fontSize: 11,
          letterSpacing: 4,
          cursor: "pointer",
        }}
        onMouseEnter={(e) => {
          e.target.style.background = "rgba(200,150,30,0.1)";
        }}
        onMouseLeave={(e) => {
          e.target.style.background = "transparent";
        }}
      >
        {isLastStage ? "CLAIM THE TREASURE" : `STAGE ${stage.id + 1} →`}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  GAME OVER SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
function GameOverScreen({ stage, onRetry }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 60,
        background: "rgba(8,6,3,0.97)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        fontFamily: "'Courier New', monospace",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 32,
          border: "1px solid #3A1010",
          pointerEvents: "none",
        }}
      />
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontSize: 10,
            letterSpacing: 5,
            color: "#5C2020",
            marginBottom: 14,
          }}
        >
          THE SHIP IS LOST
        </div>
        <div
          style={{
            fontSize: 30,
            color: "#8B2020",
            letterSpacing: 2,
            marginBottom: 8,
          }}
        >
          Hull Destroyed
        </div>
        <div
          style={{
            fontSize: 11,
            color: "#3A2020",
            lineHeight: 1.8,
            maxWidth: 360,
          }}
        >
          Stage {stage.id} — {stage.name}.<br />
          The sea claimed you. But the treasure still waits.
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
          fontSize: 11,
          letterSpacing: 4,
          cursor: "pointer",
        }}
        onMouseEnter={(e) => {
          e.target.style.background = "rgba(139,32,32,0.1)";
        }}
        onMouseLeave={(e) => {
          e.target.style.background = "transparent";
        }}
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
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#080603",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 32,
        zIndex: 100,
        fontFamily: "'Courier New', monospace",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 24,
          border: "1px solid #2A2010",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 28,
          border: "1px solid #1A1408",
          pointerEvents: "none",
        }}
      />
      <div style={{ textAlign: "center", maxWidth: 560 }}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: 6,
            color: "#5C4A1E",
            marginBottom: 16,
          }}
        >
          WHISPERLESS WAVES
        </div>
        <h1
          style={{
            fontSize: 40,
            fontWeight: "normal",
            color: "#C8961E",
            lineHeight: 1.2,
            margin: "0 0 8px",
            letterSpacing: 2,
            textShadow: "0 0 40px rgba(200,150,30,0.4)",
          }}
        >
          The Blind Captain
        </h1>
        <h1
          style={{
            fontSize: 40,
            fontWeight: "normal",
            color: "#8B7340",
            lineHeight: 1.2,
            margin: "0 0 24px",
            letterSpacing: 2,
          }}
        >
          & The Mute Navigator
        </h1>
        <p
          style={{
            color: "#5C4A1E",
            fontSize: 12,
            lineHeight: 1.8,
            letterSpacing: 1,
            borderLeft: "2px solid #3A2E12",
            paddingLeft: 16,
            textAlign: "left",
          }}
        >
          6 stages. One ship. Neither of you can do it alone.
        </p>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 1,
          border: "1px solid #3A2E12",
          background: "#3A2E12",
        }}
      >
        {[
          [
            "CAPTAIN",
            "Left side",
            "Sees the map, hazards & destination",
            "WASD to move cursor · SPACE to ping",
          ],
          [
            "NAVIGATOR",
            "Right side",
            "Controls helm, sails & anchor",
            "Arrow keys to steer & adjust sails · Q anchor",
          ],
        ].map(([role, side, desc, keys]) => (
          <div
            key={role}
            style={{
              background: "#080603",
              padding: "18px 22px",
              display: "flex",
              flexDirection: "column",
              gap: 5,
            }}
          >
            <div style={{ fontSize: 9, letterSpacing: 4, color: "#C8961E" }}>
              {role}
            </div>
            <div style={{ fontSize: 10, color: "#5C4A1E" }}>
              {side} of screen
            </div>
            <div style={{ fontSize: 10, color: "#3A2E12", lineHeight: 1.5 }}>
              {desc}
            </div>
            <div style={{ fontSize: 9, color: "#8B7340", marginTop: 4 }}>
              {keys}
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={onStart}
        style={{
          padding: "14px 48px",
          background: "transparent",
          border: "1px solid #C8961E",
          color: "#C8961E",
          fontFamily: "'Courier New', monospace",
          fontSize: 11,
          letterSpacing: 4,
          cursor: "pointer",
        }}
        onMouseEnter={(e) => {
          e.target.style.background = "rgba(200,150,30,0.1)";
          e.target.style.boxShadow = "0 0 20px rgba(200,150,30,0.2)";
        }}
        onMouseLeave={(e) => {
          e.target.style.background = "transparent";
          e.target.style.boxShadow = "none";
        }}
      >
        BEGIN VOYAGE
      </button>
      <div style={{ fontSize: 9, color: "#2A2010", letterSpacing: 2 }}>
        PHASE 5 — POLISH & ATMOSPHERE
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN GAME
// ═══════════════════════════════════════════════════════════════════════════════
export default function BlindCaptainGame() {
  const [screen, setScreen] = useState("intro");
  const [stageIdx, setStageIdx] = useState(0);
  const [ship, setShip] = useState(makeShip(STAGES[0]));
  const [captorPos, setCaptorPos] = useState({ x: 2, y: 2 });
  const [pingCell, setPingCell] = useState(null);
  const [damageFlash, setDamageFlash] = useState(false);
  const [mapData, setMapData] = useState(() => buildMap(1));
  const [memoryHidden, setMemoryHidden] = useState(false);
  const [memoryCountdown, setMemoryCountdown] = useState(10);
  const [shakeOffset, setShakeOffset] = useState({ x: 0, y: 0 });

  // Trust mechanic
  const [captainTrusts, setCaptainTrusts] = useState(false);
  const [navigatorTrusts, setNavigatorTrusts] = useState(false);
  const [vaultMerging, setVaultMerging] = useState(false);
  const trustWindowTimer = useRef(null);

  const pingTimer = useRef(null);
  const damageTimer = useRef(null);
  const memTimer = useRef(null);
  const shakeTimer = useRef(null);
  const creakTimer = useRef(null);

  const stage = STAGES[stageIdx];

  // ── Screen shake helper ────────────────────────────────────────────────────
  const triggerShake = useCallback((intensity = 8, duration = 420) => {
    clearTimeout(shakeTimer.current);
    let elapsed = 0;
    const step = 40;
    const decay = () => {
      elapsed += step;
      const remaining = 1 - elapsed / duration;
      if (remaining <= 0) {
        setShakeOffset({ x: 0, y: 0 });
        return;
      }
      const mag = intensity * remaining;
      setShakeOffset({
        x: (Math.random() - 0.5) * mag * 2,
        y: (Math.random() - 0.5) * mag * 2,
      });
      shakeTimer.current = setTimeout(decay, step);
    };
    decay();
  }, []);

  // ── Audio lifecycle tied to stage changes ──────────────────────────────────
  useEffect(() => {
    if (screen !== "playing") return;
    const audio = getAudio();
    audio.startWaves();
    audio.setStormIntensity(stage.stormActive);
    if (stage.stormActive) {
      audio.startRain();
      audio.scheduleThunder(true);
    } else {
      audio.stopRain();
      audio.scheduleThunder(false);
    }
    return () => {
      // Don't stop waves between stages — keep ambient going
    };
  }, [screen, stageIdx, stage.stormActive]);

  // Stop all audio on unmount
  useEffect(() => {
    return () => {
      if (audioEngine) {
        audioEngine.stopWaves();
        audioEngine.stopRain();
        audioEngine.scheduleThunder(false);
      }
    };
  }, []);

  // ── Periodic hull creak when moving ───────────────────────────────────────
  useEffect(() => {
    if (screen !== "playing") return;
    const id = setInterval(() => {
      if (ship.speed > 0 && !ship.anchor) {
        const audio = getAudio();
        if (Math.random() < 0.25) audio.playCreak();
      }
    }, 3200);
    return () => clearInterval(id);
  }, [screen, ship.speed, ship.anchor]);

  // ── Begin stage ────────────────────────────────────────────────────────────
  const beginStage = useCallback(() => {
    const s = STAGES[stageIdx];
    setShip(makeShip(s));
    setCaptorPos({ x: 1, y: 1 });
    setMapData(buildMap(s.id));
    setMemoryHidden(false);
    setMemoryCountdown(10);
    setScreen("playing");

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

  // ── Ship movement ──────────────────────────────────────────────────────────
  const advanceShip = useCallback(() => {
    setShip((prev) => {
      if (prev.anchor || prev.speed === 0) return prev;
      const { dx, dy } = headingToVec(prev.heading);
      const nx = Math.max(0, Math.min(GRID_SIZE - 1, prev.x + dx));
      const ny = Math.max(0, Math.min(GRID_SIZE - 1, prev.y + dy));
      return { ...prev, x: nx, y: ny };
    });
  }, []);

  useEffect(() => {
    if (screen !== "playing") return;
    const tid = setInterval(advanceShip, MOVE_INTERVAL);
    return () => clearInterval(tid);
  }, [screen, advanceShip]);

  // ── Collision & destination ────────────────────────────────────────────────
  useEffect(() => {
    if (screen !== "playing") return;
    const key = `${ship.x},${ship.y}`;
    const cellType = mapData.cells[key];

    if (cellType === "reef" || (cellType === "decoy" && stage.falseLandmarks)) {
      const newHP = ship.hullHP - 1;
      setShip((s) => ({ ...s, hullHP: Math.max(0, s.hullHP - 1), x: 1, y: 1 }));
      setDamageFlash(true);
      clearTimeout(damageTimer.current);
      damageTimer.current = setTimeout(() => setDamageFlash(false), 500);
      // Audio + shake
      getAudio().playCollision();
      triggerShake(10, 500);
      if (newHP <= 0) setScreen("gameover");
    }

    if (cellType === "destination") {
      getAudio().playStageComplete();
      setScreen("stageComplete");
    }
  }, [ship.x, ship.y, screen]);

  // ── Storm random damage ────────────────────────────────────────────────────
  useEffect(() => {
    if (screen !== "playing" || !stage.stormActive) return;
    const tid = setInterval(() => {
      if (Math.random() < 0.18) {
        setShip((s) => {
          const hp = Math.max(0, s.hullHP - 1);
          if (hp <= 0) setScreen("gameover");
          return { ...s, hullHP: hp };
        });
        setDamageFlash(true);
        clearTimeout(damageTimer.current);
        damageTimer.current = setTimeout(() => setDamageFlash(false), 500);
        getAudio().playCollision();
        triggerShake(6, 350);
      }
    }, 2800);
    return () => clearInterval(tid);
  }, [screen, stage.stormActive, triggerShake]);

  // ── Nav action with optional lag ──────────────────────────────────────────
  const applyNavAction = useCallback(
    (fn) => {
      if (stage.controlLag > 0) {
        setTimeout(() => setShip(fn), stage.controlLag);
      } else {
        setShip(fn);
      }
    },
    [stage.controlLag],
  );

  // ── Keyboard ──────────────────────────────────────────────────────────────
  const handleKey = useCallback(
    (e) => {
      if (screen !== "playing") return;
      const k = e.key;
      const audio = getAudio();

      if (k === "w" || k === "W")
        setCaptorPos((p) => ({ ...p, y: Math.max(0, p.y - 1) }));
      if (k === "s" || k === "S")
        setCaptorPos((p) => ({ ...p, y: Math.min(GRID_SIZE - 1, p.y + 1) }));
      if (k === "a" || k === "A")
        setCaptorPos((p) => ({ ...p, x: Math.max(0, p.x - 1) }));
      if (k === "d" || k === "D")
        setCaptorPos((p) => ({ ...p, x: Math.min(GRID_SIZE - 1, p.x + 1) }));
      if (k === " ") {
        setCaptorPos((p) => {
          const ck = `${p.x},${p.y}`;
          setPingCell(ck);
          clearTimeout(pingTimer.current);
          pingTimer.current = setTimeout(() => setPingCell(null), 1500);
          audio.playPing();
          return p;
        });
        e.preventDefault();
      }

      if (k === "ArrowLeft") {
        applyNavAction((s) => ({
          ...s,
          heading: (s.heading - 15 + 360) % 360,
        }));
      }
      if (k === "ArrowRight") {
        applyNavAction((s) => ({ ...s, heading: (s.heading + 15) % 360 }));
      }
      if (k === "ArrowUp") {
        applyNavAction((s) => ({ ...s, sails: Math.min(100, s.sails + 10) }));
        audio.playSailChange();
      }
      if (k === "ArrowDown") {
        applyNavAction((s) => ({ ...s, sails: Math.max(0, s.sails - 10) }));
        audio.playSailChange();
      }
      if (k === "q" || k === "Q") {
        applyNavAction((s) => {
          audio.playAnchor(!s.anchor);
          return { ...s, anchor: !s.anchor };
        });
      }
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(k))
        e.preventDefault();
    },
    [screen, applyNavAction],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  // ── Speed derived from sails & anchor ─────────────────────────────────────
  useEffect(() => {
    if (ship.anchor) {
      setShip((s) => ({ ...s, speed: 0 }));
      return;
    }
    const sp =
      ship.sails < 25 ? 0 : ship.sails < 50 ? 1 : ship.sails < 80 ? 2 : 3;
    setShip((s) => (s.speed !== sp ? { ...s, speed: sp } : s));
  }, [ship.sails, ship.anchor]);

  // ── Trust mechanic ────────────────────────────────────────────────────────
  const handleTrustPress = useCallback(
    (who) => {
      if (screen !== "trust") return;
      getAudio().playTrustPress();
      if (who === "captain") {
        setCaptainTrusts(true);
        clearTimeout(trustWindowTimer.current);
        trustWindowTimer.current = setTimeout(
          () => setCaptainTrusts(false),
          4000,
        );
      }
      if (who === "navigator") {
        setNavigatorTrusts(true);
        clearTimeout(trustWindowTimer.current);
        trustWindowTimer.current = setTimeout(
          () => setNavigatorTrusts(false),
          4000,
        );
      }
    },
    [screen],
  );

  useEffect(() => {
    if (captainTrusts && navigatorTrusts) {
      clearTimeout(trustWindowTimer.current);
      getAudio().playVaultOpen();
      setVaultMerging(true);
      setTimeout(() => {
        setScreen("vault");
        setVaultMerging(false);
        setCaptainTrusts(false);
        setNavigatorTrusts(false);
      }, 1200);
    }
  }, [captainTrusts, navigatorTrusts]);

  useEffect(() => {
    if (screen !== "trust") return;
    const onKey = (e) => {
      if (e.key === "t" || e.key === "T") handleTrustPress("captain");
      if (e.key === "y" || e.key === "Y") handleTrustPress("navigator");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, handleTrustPress]);

  // ── Next / Retry stage ────────────────────────────────────────────────────
  const goNextStage = useCallback(() => {
    clearInterval(memTimer.current);
    if (stageIdx >= STAGES.length - 1) {
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

  const retryStage = useCallback(() => {
    clearInterval(memTimer.current);
    clearTimeout(trustWindowTimer.current);
    setCaptainTrusts(false);
    setNavigatorTrusts(false);
    setScreen("stageIntro");
  }, []);

  // ──────────────────────────────────────────────────────────────────────────
  if (screen === "intro")
    return <IntroScreen onStart={() => setScreen("stageIntro")} />;

  // ── TRUST SCREEN ──────────────────────────────────────────────────────────
  if (screen === "trust") {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "#080603",
          fontFamily: "'Courier New', monospace",
          overflow: "hidden",
        }}
      >
        <style>{`
          @keyframes trustGlow   { 0%,100% { box-shadow: 0 0 0px rgba(212,164,32,0); } 50% { box-shadow: 0 0 40px rgba(212,164,32,0.7); } }
          @keyframes trustPulse  { 0%,100% { opacity: 0.35; transform: scale(1); }    50% { opacity: 1; transform: scale(1.04); } }
          @keyframes mergeCollapse { 0% { opacity:1; clip-path: inset(0 0 0 0); } 100% { opacity:0; clip-path: inset(0 50% 0 50%); } }
        `}</style>
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            animation: vaultMerging
              ? "mergeCollapse 1.2s ease-in forwards"
              : "none",
          }}
        >
          {/* Captain side */}
          <div
            style={{
              flex: "0 0 50%",
              height: "100%",
              background: "linear-gradient(160deg, #1a1208 0%, #0d1a12 100%)",
              borderRight: "1px solid #3A2E12",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 32,
              position: "relative",
            }}
          >
            {[...Array(12)].map((_, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: `${10 + ((i * 7) % 80)}%`,
                  top: `${15 + ((i * 13) % 70)}%`,
                  width: 2,
                  height: 2,
                  borderRadius: "50%",
                  background: captainTrusts ? "#D4A420" : "#2A2010",
                  transition: "background 0.4s",
                  animation: captainTrusts
                    ? `trustPulse ${1.2 + i * 0.1}s ease-in-out infinite`
                    : "none",
                  animationDelay: `${i * 0.08}s`,
                }}
              />
            ))}
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: 9,
                  letterSpacing: 5,
                  color: "#3A2E12",
                  marginBottom: 12,
                }}
              >
                CAPTAIN
              </div>
              <div
                style={{
                  fontSize: 28,
                  color: captainTrusts ? "#D4A420" : "#5C4A1E",
                  letterSpacing: 2,
                  lineHeight: 1.3,
                  marginBottom: 8,
                  transition: "color 0.4s",
                  textShadow: captainTrusts
                    ? "0 0 30px rgba(212,164,32,0.5)"
                    : "none",
                }}
              >
                {captainTrusts
                  ? "I TRUST YOU"
                  : "Do you trust\nyour Navigator?"}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "#3A2E12",
                  letterSpacing: 1,
                  lineHeight: 1.7,
                  whiteSpace: "pre-line",
                }}
              >
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
                background: captainTrusts
                  ? "rgba(212,164,32,0.12)"
                  : "transparent",
                border: `2px solid ${captainTrusts ? "#D4A420" : "#5C4A1E"}`,
                color: captainTrusts ? "#D4A420" : "#5C4A1E",
                fontFamily: "'Courier New', monospace",
                fontSize: 11,
                letterSpacing: 4,
                cursor: captainTrusts ? "default" : "pointer",
                transition: "all 0.3s",
                animation: captainTrusts
                  ? "trustGlow 1.5s ease-in-out infinite"
                  : "none",
              }}
            >
              {captainTrusts ? "✦ TRUST GIVEN" : "[ T ] — I TRUST YOU"}
            </button>
            <div style={{ fontSize: 9, color: "#2A2010", letterSpacing: 2 }}>
              PRESS T ON KEYBOARD
            </div>
          </div>

          {/* Divider */}
          <div
            style={{
              width: 3,
              background: vaultMerging
                ? "linear-gradient(to bottom, #D4A420, #C8961E, #D4A420)"
                : "linear-gradient(to bottom, transparent, #5C4A1E 20%, #8B7340 50%, #5C4A1E 80%, transparent)",
              boxShadow: vaultMerging
                ? "0 0 20px rgba(212,164,32,0.8)"
                : "0 0 12px rgba(139,115,64,0.3)",
              transition: "all 0.4s",
              flexShrink: 0,
              zIndex: 10,
            }}
          />

          {/* Navigator side */}
          <div
            style={{
              flex: "0 0 50%",
              height: "100%",
              background: "linear-gradient(170deg, #110D08 0%, #1A1008 100%)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 32,
              position: "relative",
            }}
          >
            {[...Array(12)].map((_, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: `${5 + ((i * 9) % 85)}%`,
                  top: `${20 + ((i * 11) % 65)}%`,
                  width: 2,
                  height: 2,
                  borderRadius: "50%",
                  background: navigatorTrusts ? "#D4A420" : "#2A2010",
                  transition: "background 0.4s",
                  animation: navigatorTrusts
                    ? `trustPulse ${1.3 + i * 0.09}s ease-in-out infinite`
                    : "none",
                  animationDelay: `${i * 0.07}s`,
                }}
              />
            ))}
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: 9,
                  letterSpacing: 5,
                  color: "#3A2E12",
                  marginBottom: 12,
                }}
              >
                NAVIGATOR
              </div>
              <div
                style={{
                  fontSize: 28,
                  color: navigatorTrusts ? "#D4A420" : "#5C4A1E",
                  letterSpacing: 2,
                  lineHeight: 1.3,
                  marginBottom: 8,
                  transition: "color 0.4s",
                  textShadow: navigatorTrusts
                    ? "0 0 30px rgba(212,164,32,0.5)"
                    : "none",
                }}
              >
                {navigatorTrusts
                  ? "I TRUST YOU"
                  : "Do you trust\nyour Captain?"}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "#3A2E12",
                  letterSpacing: 1,
                  lineHeight: 1.7,
                  whiteSpace: "pre-line",
                }}
              >
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
                background: navigatorTrusts
                  ? "rgba(212,164,32,0.12)"
                  : "transparent",
                border: `2px solid ${navigatorTrusts ? "#D4A420" : "#5C4A1E"}`,
                color: navigatorTrusts ? "#D4A420" : "#5C4A1E",
                fontFamily: "'Courier New', monospace",
                fontSize: 11,
                letterSpacing: 4,
                cursor: navigatorTrusts ? "default" : "pointer",
                transition: "all 0.3s",
                animation: navigatorTrusts
                  ? "trustGlow 1.5s ease-in-out infinite"
                  : "none",
              }}
            >
              {navigatorTrusts ? "✦ TRUST GIVEN" : "[ Y ] — I TRUST YOU"}
            </button>
            <div style={{ fontSize: 9, color: "#2A2010", letterSpacing: 2 }}>
              PRESS Y ON KEYBOARD
            </div>
          </div>
        </div>

        {!captainTrusts && !navigatorTrusts && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 20,
              textAlign: "center",
              background: "#080603",
              padding: "12px 20px",
              border: "1px solid #2A2010",
            }}
          >
            <div
              style={{
                fontSize: 9,
                color: "#3A2E12",
                letterSpacing: 3,
                lineHeight: 2,
              }}
            >
              NO COUNTDOWN
              <br />
              NO HINT
              <br />
              JUST FEEL READY TOGETHER
            </div>
          </div>
        )}
        {(captainTrusts || navigatorTrusts) &&
          !(captainTrusts && navigatorTrusts) && (
            <div
              style={{
                position: "absolute",
                bottom: 32,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 20,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: "#8B7340",
                  letterSpacing: 3,
                  animation: "trustPulse 1.2s ease-in-out infinite",
                }}
              >
                ◆ ONE VOICE HAS SPOKEN ◆
              </div>
            </div>
          )}
      </div>
    );
  }

  // ── VAULT SCREEN ──────────────────────────────────────────────────────────
  if (screen === "vault") {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background:
            "radial-gradient(ellipse at center, #1A1208 0%, #080603 70%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 0,
          fontFamily: "'Courier New', monospace",
          overflow: "hidden",
        }}
      >
        <style>{`
          @keyframes vaultReveal  { 0% { opacity:0; transform: scale(0.88) translateY(28px); } 100% { opacity:1; transform: scale(1) translateY(0); } }
          @keyframes goldShimmer  { 0% { background-position: -300% center; } 100% { background-position: 300% center; } }
          @keyframes floatUp      { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-8px); } }
          @keyframes particleDrift { 0% { transform: translateY(0) translateX(0) scale(1); opacity:0.6; } 100% { transform: translateY(-60px) translateX(var(--dx,20px)) scale(0); opacity:0; } }
          @keyframes borderPulse  { 0%,100% { opacity:0.3; } 50% { opacity:0.9; } }
          @keyframes staggerFadeIn { from { opacity:0; transform: translateY(12px); } to { opacity:1; transform: translateY(0); } }
        `}</style>

        {[...Array(28)].map((_, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${Math.random() * 100}%`,
              top: `${20 + Math.random() * 80}%`,
              width: i % 3 === 0 ? 3 : 2,
              height: i % 3 === 0 ? 3 : 2,
              borderRadius: "50%",
              background:
                i % 4 === 0 ? "#D4A420" : i % 4 === 1 ? "#C8961E" : "#8B7340",
              animation: `particleDrift ${2 + ((i * 0.17) % 2)}s ease-out infinite`,
              animationDelay: `${(i * 0.13) % 2}s`,
              "--dx": `${((i % 7) - 3) * 8}px`,
              opacity: 0.5,
            }}
          />
        ))}

        <div
          style={{
            position: "absolute",
            inset: 16,
            border: "1px solid #3A2E12",
            animation: "borderPulse 3s ease-in-out infinite",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 22,
            border: "1px solid #2A2010",
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            textAlign: "center",
            maxWidth: 640,
            padding: "0 32px",
            animation: "vaultReveal 1.2s cubic-bezier(0.16,1,0.3,1) forwards",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 24,
          }}
        >
          <div
            style={{
              fontSize: 9,
              letterSpacing: 7,
              color: "#5C4A1E",
              animation: "staggerFadeIn 0.6s ease-out 0.3s both",
            }}
          >
            THE VOYAGE IS COMPLETE
          </div>
          <div
            style={{
              fontSize: 64,
              lineHeight: 1,
              animation:
                "floatUp 4s ease-in-out infinite, staggerFadeIn 0.8s ease-out 0.5s both",
              filter: "drop-shadow(0 0 20px rgba(212,164,32,0.5))",
            }}
          >
            🏴‍☠️
          </div>
          <div style={{ animation: "staggerFadeIn 0.8s ease-out 0.7s both" }}>
            <div
              style={{
                fontSize: 48,
                letterSpacing: 3,
                lineHeight: 1,
                background:
                  "linear-gradient(90deg, #8B7340, #D4A420, #C8961E, #D4A420, #8B7340)",
                backgroundSize: "300% auto",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                animation: "goldShimmer 4s linear infinite",
                fontWeight: "normal",
              }}
            >
              Isla del Tesoro
            </div>
            <div
              style={{
                fontSize: 11,
                color: "#5C4A1E",
                letterSpacing: 4,
                marginTop: 6,
              }}
            >
              THE TREASURE OF CAPTAIN BLACKWAVE VOSS
            </div>
          </div>

          <div
            style={{
              width: "100%",
              maxWidth: 520,
              border: "1px solid #5C4A1E",
              background:
                "linear-gradient(135deg, #0D0904 0%, #1A1208 50%, #0D0904 100%)",
              padding: "28px 32px",
              position: "relative",
              animation: "staggerFadeIn 0.8s ease-out 1s both",
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: "#5C4A1E",
                lineHeight: 2,
                textAlign: "left",
                borderLeft: "2px solid #3A2E12",
                paddingLeft: 16,
              }}
            >
              Six stages. Six seas. You sailed them as one.
              <br />
              The blind found their eyes in a voice.
              <br />
              The mute found their words in a hand on the helm.
              <br />
              <br />
              <span style={{ color: "#8B7340" }}>
                When you both said <em>I trust you</em> —<br />
                the vault opened by itself.
              </span>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              animation: "staggerFadeIn 0.6s ease-out 1.4s both",
            }}
          >
            {STAGES.map((s, i) => (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: "#D4A420",
                    border: "1px solid #5C4A1E",
                    boxShadow: "0 0 8px rgba(212,164,32,0.7)",
                    animation: `floatUp ${2 + i * 0.15}s ease-in-out infinite`,
                    animationDelay: `${i * 0.2}s`,
                  }}
                />
                <div
                  style={{ fontSize: 7, color: "#3A2E12", letterSpacing: 1 }}
                >
                  {s.id}
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              gap: 12,
              animation: "staggerFadeIn 0.6s ease-out 1.8s both",
            }}
          >
            <button
              onClick={() => {
                setStageIdx(0);
                setCaptainTrusts(false);
                setNavigatorTrusts(false);
                setScreen("intro");
              }}
              style={{
                padding: "12px 36px",
                background: "transparent",
                border: "1px solid #5C4A1E",
                color: "#5C4A1E",
                fontFamily: "'Courier New', monospace",
                fontSize: 10,
                letterSpacing: 4,
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.target.style.background = "rgba(92,74,30,0.15)";
                e.target.style.color = "#8B7340";
              }}
              onMouseLeave={(e) => {
                e.target.style.background = "transparent";
                e.target.style.color = "#5C4A1E";
              }}
            >
              SAIL AGAIN
            </button>
            <button
              onClick={() => {
                setCaptainTrusts(false);
                setNavigatorTrusts(false);
                setScreen("trust");
              }}
              style={{
                padding: "12px 36px",
                background: "transparent",
                border: "1px solid #3A2E12",
                color: "#3A2E12",
                fontFamily: "'Courier New', monospace",
                fontSize: 10,
                letterSpacing: 4,
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.target.style.background = "rgba(58,46,18,0.15)";
                e.target.style.color = "#5C4A1E";
              }}
              onMouseLeave={(e) => {
                e.target.style.background = "transparent";
                e.target.style.color = "#3A2E12";
              }}
            >
              BACK TO VAULT
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── GAME SCREEN ───────────────────────────────────────────────────────────
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        overflow: "hidden",
        fontFamily: "'Courier New', monospace",
        background: "#080603",
        position: "relative",
      }}
    >
      <style>{`
        @keyframes pingFade     { 0% { opacity:1; transform:scale(1); } 100% { opacity:0; transform:scale(1.4); } }
        @keyframes damageFlash  { 0% { opacity:1; } 100% { opacity:0; } }
        @keyframes stormPulse   { 0%,100% { opacity:0.7; } 50% { opacity:1; } }
        * { box-sizing:border-box; }
        button:active { opacity:0.7; }
        ::-webkit-scrollbar { display:none; }
      `}</style>

      <MuteButton />

      {/* Divider */}
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: "58%",
          width: 3,
          background:
            "linear-gradient(to bottom, transparent, #5C4A1E 20%, #8B7340 50%, #5C4A1E 80%, transparent)",
          zIndex: 10,
          pointerEvents: "none",
          boxShadow: "0 0 12px rgba(139,115,64,0.3)",
        }}
      />

      <CaptainPanel
        ship={ship}
        pingCell={pingCell}
        captorPos={captorPos}
        stage={stage}
        mapData={mapData}
        memoryHidden={memoryHidden}
        memoryCountdown={memoryCountdown}
        shakeOffset={shakeOffset}
      />

      <NavigatorPanel
        ship={ship}
        stage={stage}
        onSteer={(dir) =>
          applyNavAction((s) => ({
            ...s,
            heading:
              dir === "left"
                ? (s.heading - 15 + 360) % 360
                : (s.heading + 15) % 360,
          }))
        }
        onSails={(dir) => {
          getAudio().playSailChange();
          applyNavAction((s) => ({
            ...s,
            sails:
              dir === "up"
                ? Math.min(100, s.sails + 10)
                : Math.max(0, s.sails - 10),
          }));
        }}
        onAnchor={() => {
          applyNavAction((s) => {
            getAudio().playAnchor(!s.anchor);
            return { ...s, anchor: !s.anchor };
          });
        }}
        stageIndex={stageIdx}
        memoryHidden={memoryHidden}
        shakeOffset={shakeOffset}
      />

      {/* Full-screen damage flash */}
      {damageFlash && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 40,
            pointerEvents: "none",
            background: "rgba(139,32,32,0.35)",
            animation: "damageFlash 0.4s ease-out forwards",
          }}
        />
      )}

      {screen === "stageIntro" && (
        <StageIntroCard stage={stage} onBegin={beginStage} />
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
