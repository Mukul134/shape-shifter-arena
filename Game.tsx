"use client";

import { useEffect, useRef, useState, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────
type Shape = "circle" | "triangle" | "square";
type ItemType = "health" | "speed" | "shield" | "score";
type Mode = "elimination" | "timed";

interface KeyMap { u: string; d: string; l: string; r: string; }

interface Player {
  id: number; name: string; shape: Shape; color: string; keys: KeyMap;
  x: number; y: number; vx: number; vy: number;
  hp: number; score: number; alive: boolean;
  inv: number; deaths: number; speedBoost: number; shield: number;
  respawnT: number; passWalls: boolean;
}

interface Enemy {
  x: number; y: number; hp: number; alive: boolean;
  target: Player | null; vx: number; vy: number;
  angle: number; wt: number;
}

interface Item {
  x: number; y: number; type: ItemType; t: number;
}

interface ActiveRules {
  triangles_faster?: boolean;
  circles_pass_walls?: boolean;
  squares_steal_double?: boolean;
  top_targeted?: boolean;
  arena_shrinks?: boolean;
  struggling_boost?: boolean;
  enemy_frenzy?: boolean;
  score_frenzy?: boolean;
  _boostId?: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const PLAYER_COLORS = ["#6090ff", "#ff8040", "#40e080", "#e040e0"];
const PLAYER_SHAPES: Shape[] = ["circle", "triangle", "square", "circle"];
const PLAYER_NAMES = ["P1", "P2", "P3", "P4"];
const KEYS: KeyMap[] = [
  { u: "KeyW", d: "KeyS", l: "KeyA", r: "KeyD" },
  { u: "ArrowUp", d: "ArrowDown", l: "ArrowLeft", r: "ArrowRight" },
  { u: "KeyI", d: "KeyK", l: "KeyJ", r: "KeyL" },
  { u: "Numpad8", d: "Numpad5", l: "Numpad4", r: "Numpad6" },
];

const SPD = 180, PRADIUS = 18, MAXHP = 100;
const ENEMY_SPD = 80, ERADIUS = 12, EHP = 35, EDAMAGE = 10;
const ITEM_RADIUS = 9, ITEM_SPAWN_INT = 5, MAX_ITEMS = 8;
const PASSIVE_PTS = 4, RULE_INTERVAL = 14, INV_TIME = 1.2;

const ALL_RULES: Record<string, string> = {
  triangles_faster: "⚡ Triangles move 45% faster",
  circles_pass_walls: "🌀 Circles wrap through walls",
  squares_steal_double: "💰 Squares steal 2× points",
  top_targeted: "🎯 Leader is enemy priority",
  arena_shrinks: "⚠️ Arena is shrinking!",
  struggling_boost: "🛡️ Trailing player speed boost",
  enemy_frenzy: "👾 Enemies are frenzied",
  score_frenzy: "🔥 Double passive score rate",
};

// ── Game Engine (runs outside React state for performance) ────────────────────
class GameEngine {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  np: number; mode: Mode;
  players: Player[] = [];
  enemies: Enemy[] = [];
  items: Item[] = [];
  activeRules: ActiveRules = {};
  ruleTimer = 0; itemTimer = 0; enemyTimer = 0;
  elapsed = 0; gameLimit: number | null;
  over = false; winner: Player | null = null;
  raf = 0;
  ax = 0; ay = 0; aw = 0; ah = 0;
  origAw = 0; origAh = 0;
  keysDown: Set<string>;
  onUpdate: (players: Player[], rules: ActiveRules, elapsed: number) => void;
  onEnd: (winner: Player, players: Player[]) => void;

  constructor(
    canvas: HTMLCanvasElement,
    np: number, mode: Mode,
    keysDown: Set<string>,
    onUpdate: (players: Player[], rules: ActiveRules, elapsed: number) => void,
    onEnd: (winner: Player, players: Player[]) => void
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.np = np; this.mode = mode;
    this.keysDown = keysDown;
    this.gameLimit = mode === "timed" ? 180 : null;
    this.onUpdate = onUpdate;
    this.onEnd = onEnd;
    this.arenaSetup();
    this.initPlayers();
    for (let i = 0; i < 3; i++) this.spawnEnemy();
    for (let i = 0; i < 4; i++) this.spawnItem();
  }

  arenaSetup() {
    const pad = 14;
    this.ax = pad; this.ay = pad;
    this.aw = this.canvas.width - pad * 2;
    this.ah = this.canvas.height - pad * 2;
    this.origAw = this.aw; this.origAh = this.ah;
  }

  initPlayers() {
    const spots = [
      [this.ax + 60, this.ay + 60],
      [this.ax + this.aw - 60, this.ay + 60],
      [this.ax + 60, this.ay + this.ah - 60],
      [this.ax + this.aw - 60, this.ay + this.ah - 60],
    ];
    this.players = [];
    for (let i = 0; i < this.np; i++) {
      this.players.push({
        id: i, name: PLAYER_NAMES[i], shape: PLAYER_SHAPES[i],
        color: PLAYER_COLORS[i], keys: KEYS[i],
        x: spots[i][0], y: spots[i][1], vx: 0, vy: 0,
        hp: MAXHP, score: 0, alive: true, inv: 0, deaths: 0,
        speedBoost: 0, shield: 0, respawnT: 0, passWalls: false,
      });
    }
  }

  spawnEnemy() {
    const sides = ["top", "bot", "left", "right"];
    const s = sides[Math.floor(Math.random() * 4)];
    let x = 0, y = 0;
    if (s === "top") { x = this.ax + 20 + Math.random() * (this.aw - 40); y = this.ay + 20; }
    if (s === "bot") { x = this.ax + 20 + Math.random() * (this.aw - 40); y = this.ay + this.ah - 20; }
    if (s === "left") { x = this.ax + 20; y = this.ay + 20 + Math.random() * (this.ah - 40); }
    if (s === "right") { x = this.ax + this.aw - 20; y = this.ay + 20 + Math.random() * (this.ah - 40); }
    const alive = this.players.filter(p => p.alive);
    this.enemies.push({ x, y, hp: EHP, alive: true, target: alive[0] || null, vx: 0, vy: 0, angle: Math.random() * Math.PI * 2, wt: 1 });
  }

  spawnItem() {
    const types: ItemType[] = ["health", "speed", "shield", "score"];
    this.items.push({
      x: this.ax + 30 + Math.random() * (this.aw - 60),
      y: this.ay + 30 + Math.random() * (this.ah - 60),
      type: types[Math.floor(Math.random() * 4)],
      t: Math.random() * Math.PI * 2,
    });
  }

  update(dt: number) {
    if (this.over) return;
    this.elapsed += dt;
    const rules = this.activeRules;
    const alive = this.players.filter(p => p.alive);

    // Players
    for (const p of this.players) {
      if (!p.alive) {
        if (this.mode === "timed") {
          p.respawnT -= dt;
          if (p.respawnT <= 0) this.respawn(p);
        }
        continue;
      }
      p.inv = Math.max(0, p.inv - dt);
      p.speedBoost = Math.max(0, p.speedBoost - dt);
      p.shield = Math.max(0, p.shield - dt);

      let spd = SPD;
      if (rules.triangles_faster && p.shape === "triangle") spd *= 1.45;
      if (rules.struggling_boost && rules._boostId === p.id) spd *= 1.3;
      if (p.speedBoost > 0) spd += 90;
      p.passWalls = !!(rules.circles_pass_walls && p.shape === "circle");

      let dx = 0, dy = 0;
      if (this.keysDown.has(p.keys.u)) dy -= 1;
      if (this.keysDown.has(p.keys.d)) dy += 1;
      if (this.keysDown.has(p.keys.l)) dx -= 1;
      if (this.keysDown.has(p.keys.r)) dx += 1;
      const mag = Math.hypot(dx, dy);
      if (mag > 0) { dx /= mag; dy /= mag; }
      p.vx = dx * spd; p.vy = dy * spd;
      p.x += p.vx * dt; p.y += p.vy * dt;

      if (p.passWalls) {
        if (p.x < this.ax) p.x = this.ax + this.aw;
        if (p.x > this.ax + this.aw) p.x = this.ax;
        if (p.y < this.ay) p.y = this.ay + this.ah;
        if (p.y > this.ay + this.ah) p.y = this.ay;
      } else {
        p.x = Math.max(this.ax + PRADIUS, Math.min(this.ax + this.aw - PRADIUS, p.x));
        p.y = Math.max(this.ay + PRADIUS, Math.min(this.ay + this.ah - PRADIUS, p.y));
      }

      const rate = rules.score_frenzy ? PASSIVE_PTS * 2 : PASSIVE_PTS;
      p.score += rate * dt;

      if (rules.arena_shrinks) {
        if (p.x < this.ax || p.x > this.ax + this.aw || p.y < this.ay || p.y > this.ay + this.ah) {
          p.hp -= 18 * dt;
          if (p.hp <= 0) { p.hp = 0; this.killPlayer(p); }
        }
      }
    }

    // PvP
    for (let i = 0; i < this.players.length; i++) {
      for (let j = i + 1; j < this.players.length; j++) {
        const a = this.players[i], b = this.players[j];
        if (!a.alive || !b.alive) continue;
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (dist < PRADIUS * 2) {
          const nx = (b.x - a.x) / Math.max(dist, 0.1);
          const ny = (b.y - a.y) / Math.max(dist, 0.1);
          a.vx -= nx * 200; a.vy -= ny * 200;
          b.vx += nx * 200; b.vy += ny * 200;
          const mul = rules.squares_steal_double ? 2 : 1;
          const steal = 20 * mul;
          if (a.shape === "square" || rules.squares_steal_double) { const s = Math.min(b.score, steal); a.score += s; b.score -= s; }
          if (b.shape === "square" || rules.squares_steal_double) { const s = Math.min(a.score, steal); b.score += s; a.score -= s; }
        }
      }
    }

    // Enemies
    const top = alive.length ? alive.reduce((a, b) => b.score > a.score ? b : a, alive[0]) : null;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      let target = e.target && e.target.alive ? e.target : (alive[0] || null);
      if (rules.top_targeted && top) target = top;
      if (target && target.alive) {
        const dx2 = target.x - e.x, dy2 = target.y - e.y;
        const d = Math.max(Math.hypot(dx2, dy2), 0.1);
        const spd2 = rules.enemy_frenzy ? ENEMY_SPD * 1.6 : ENEMY_SPD;
        e.vx = (dx2 / d) * spd2; e.vy = (dy2 / d) * spd2;
      } else {
        e.wt -= dt;
        if (e.wt <= 0) { e.angle += Math.random() * 1.4 - 0.7; e.wt = Math.random() * 2 + 0.8; }
        const s2 = rules.enemy_frenzy ? ENEMY_SPD * 0.8 : ENEMY_SPD * 0.5;
        e.vx = Math.cos(e.angle) * s2; e.vy = Math.sin(e.angle) * s2;
      }
      e.x += e.vx * dt; e.y += e.vy * dt;
      e.x = Math.max(this.ax + ERADIUS, Math.min(this.ax + this.aw - ERADIUS, e.x));
      e.y = Math.max(this.ay + ERADIUS, Math.min(this.ay + this.ah - ERADIUS, e.y));

      for (const p of alive) {
        if (p.inv > 0 || p.shield > 0) continue;
        if (Math.hypot(p.x - e.x, p.y - e.y) < PRADIUS + ERADIUS) {
          let dmg = EDAMAGE;
          if (rules.top_targeted && p === top) dmg *= 1.5;
          p.hp -= dmg; p.inv = INV_TIME;
          const dx3 = e.x - p.x, dy3 = e.y - p.y;
          const d3 = Math.max(Math.hypot(dx3, dy3), 0.1);
          e.vx = (dx3 / d3) * 180; e.vy = (dy3 / d3) * 180;
          if (p.hp <= 0) { p.hp = 0; this.killPlayer(p); }
        }
      }
    }

    // Items
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      item.t += 0.06;
      for (const p of alive) {
        if (Math.hypot(p.x - item.x, p.y - item.y) < PRADIUS + ITEM_RADIUS) {
          this.applyItem(p, item);
          this.items.splice(i, 1);
          break;
        }
      }
    }

    this.itemTimer += dt;
    if (this.itemTimer >= ITEM_SPAWN_INT && this.items.length < MAX_ITEMS) { this.spawnItem(); this.itemTimer = 0; }
    this.enemyTimer += dt;
    if (this.enemyTimer >= 9 && this.enemies.filter(e => e.alive).length < 8) { this.spawnEnemy(); this.enemyTimer = 0; }
    this.ruleTimer += dt;
    if (this.ruleTimer >= RULE_INTERVAL) { this.evaluateRules(); this.ruleTimer = 0; }

    if (rules.arena_shrinks) {
      this.aw = Math.max(300, this.aw - 6 * dt);
      this.ah = Math.max(240, this.ah - 6 * dt);
      this.ax = 14 + (this.origAw - this.aw) / 2;
      this.ay = 14 + (this.origAh - this.ah) / 2;
    }

    this.enemies = this.enemies.filter(e => e.alive);
    this.checkWin();
    this.onUpdate([...this.players], { ...this.activeRules }, this.elapsed);
  }

  applyItem(p: Player, item: Item) {
    const mul = (item.type === "score" && this.activeRules.squares_steal_double && p.shape === "square") ? 2 : 1;
    if (item.type === "health") p.hp = Math.min(MAXHP, p.hp + 35);
    if (item.type === "speed") p.speedBoost += 5;
    if (item.type === "shield") { p.shield += 6; p.inv = Math.max(p.inv, 6); }
    if (item.type === "score") p.score += 150 * mul;
  }

  killPlayer(p: Player) {
    p.alive = false; p.deaths++; p.score = Math.max(0, p.score - 50); p.respawnT = 4;
  }

  respawn(p: Player) {
    p.alive = true; p.hp = MAXHP; p.inv = 2;
    p.x = this.ax + 40 + Math.random() * (this.aw - 80);
    p.y = this.ay + 40 + Math.random() * (this.ah - 80);
  }

  evaluateRules() {
    const alive = this.players.filter(p => p.alive);
    if (!alive.length) return;
    const scores = alive.map(p => p.score);
    const maxS = Math.max(...scores), minS = Math.min(...scores);
    const gap = maxS - minS;
    const topP = alive.find(p => p.score === maxS)!;
    const botP = alive.find(p => p.score === minS)!;
    const rules: ActiveRules = {};
    if (gap > 250 && alive.length > 1) { rules.top_targeted = true; rules.struggling_boost = true; rules._boostId = botP.id; }
    if (alive.length <= 2) rules.arena_shrinks = true;
    const shapeRules: (keyof ActiveRules)[] = [];
    if (alive.some(p => p.shape === "triangle")) shapeRules.push("triangles_faster");
    if (alive.some(p => p.shape === "circle")) shapeRules.push("circles_pass_walls");
    if (alive.some(p => p.shape === "square")) shapeRules.push("squares_steal_double");
    const visCount = Object.keys(rules).filter(k => !k.startsWith("_")).length;
    if (shapeRules.length && visCount < 2) rules[shapeRules[Math.floor(Math.random() * shapeRules.length)]] = true as never;
    const extras: (keyof ActiveRules)[] = ["score_frenzy", "enemy_frenzy"];
    const visCount2 = Object.keys(rules).filter(k => !k.startsWith("_")).length;
    if (visCount2 < 2) rules[extras[Math.floor(Math.random() * extras.length)]] = true as never;
    this.activeRules = rules;
  }

  checkWin() {
    const alive = this.players.filter(p => p.alive);
    if (this.mode === "elimination") {
      if (alive.length === 1) this.endGame(alive[0]);
      else if (alive.length === 0) this.endGame([...this.players].sort((a, b) => b.score - a.score)[0]);
    } else if (this.mode === "timed" && this.gameLimit && this.elapsed >= this.gameLimit) {
      this.endGame([...this.players].sort((a, b) => b.score - a.score)[0]);
    }
  }

  endGame(winner: Player) {
    this.over = true; this.winner = winner;
    cancelAnimationFrame(this.raf);
    this.onEnd(winner, [...this.players]);
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Arena background
    ctx.save();
    ctx.beginPath();
    this.roundRect(this.ax, this.ay, this.aw, this.ah, 8);
    ctx.fillStyle = "#0d0d20"; ctx.fill();
    ctx.strokeStyle = this.activeRules.arena_shrinks ? "#c03030" : "#1e1e40";
    ctx.lineWidth = this.activeRules.arena_shrinks ? 3 : 2;
    ctx.stroke();
    ctx.restore();

    // Grid dots
    ctx.save();
    ctx.globalAlpha = 0.06;
    for (let gx = this.ax + 20; gx < this.ax + this.aw; gx += 40) {
      for (let gy = this.ay + 20; gy < this.ay + this.ah; gy += 40) {
        ctx.beginPath(); ctx.arc(gx, gy, 1, 0, Math.PI * 2);
        ctx.fillStyle = "#8080ff"; ctx.fill();
      }
    }
    ctx.restore();

    for (const item of this.items) this.drawItem(item);
    for (const e of this.enemies) if (e.alive) this.drawEnemy(e);
    for (const p of this.players) if (p.alive) this.drawPlayer(p);
  }

  drawPlayer(p: Player) {
    const ctx = this.ctx;
    const r = PRADIUS;
    ctx.save();
    if (p.shield > 0) {
      ctx.beginPath(); ctx.arc(p.x, p.y, r + 7, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,220,60,0.5)"; ctx.lineWidth = 3; ctx.stroke();
    }
    if (p.inv > 0 && Math.sin(p.inv * 20) > 0) { ctx.restore(); return; }

    if (p.shape === "circle") {
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = p.color; ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.lineWidth = 2; ctx.stroke();
    } else if (p.shape === "triangle") {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x - r, p.y + r); ctx.lineTo(p.x + r, p.y + r);
      ctx.closePath(); ctx.fillStyle = p.color; ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.lineWidth = 2; ctx.stroke();
    } else {
      ctx.beginPath(); this.roundRect(p.x - r, p.y - r, r * 2, r * 2, 4);
      ctx.fillStyle = p.color; ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.lineWidth = 2; ctx.stroke();
    }

    if (p.speedBoost > 0) {
      ctx.globalAlpha = 0.3;
      ctx.beginPath(); ctx.arc(p.x - p.vx * 0.04, p.y - p.vy * 0.04, r * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = "#80d0ff"; ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#ffffff"; ctx.font = "bold 11px monospace";
    ctx.textAlign = "center"; ctx.fillText(p.name, p.x, p.y - r - 5);
    ctx.restore();
  }

  drawEnemy(e: Enemy) {
    const ctx = this.ctx;
    const r = ERADIUS;
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = Math.PI * 2 * i / 8;
      const rr = i % 2 === 0 ? r : r * 0.6;
      const x = e.x + Math.cos(a) * rr, y = e.y + Math.sin(a) * rr;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = "#dd2020"; ctx.fill();
    ctx.strokeStyle = "#ff6060"; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
  }

  drawItem(item: Item) {
    const ctx = this.ctx;
    const r = ITEM_RADIUS;
    const bob = Math.sin(item.t) * 3;
    const cx = item.x, cy = item.y + bob;
    const colors: Record<ItemType, string> = { health: "#40e060", speed: "#40b0e0", shield: "#ffe040", score: "#c040e0" };
    const col = colors[item.type];
    ctx.save();
    ctx.globalAlpha = 0.7 + Math.sin(item.t * 1.5) * 0.15;
    ctx.beginPath(); ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
    ctx.fillStyle = col + "22"; ctx.fill();

    if (item.type === "health") {
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = col; ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillRect(cx - 1.5, cy - r + 3, 3, r * 2 - 6);
      ctx.fillRect(cx - r + 3, cy - 1.5, r * 2 - 6, 3);
    } else if (item.type === "speed") {
      ctx.beginPath();
      ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy);
      ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    } else if (item.type === "shield") {
      ctx.beginPath();
      ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy - r / 3); ctx.lineTo(cx + r, cy + r / 3);
      ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy + r / 3); ctx.lineTo(cx - r, cy - r / 3);
      ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    } else {
      ctx.beginPath(); this.roundRect(cx - r, cy - r, r * 2, r * 2, 3);
      ctx.fillStyle = col; ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "bold 11px serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("★", cx, cy);
    }
    ctx.restore();
  }

  roundRect(x: number, y: number, w: number, h: number, r: number) {
    const ctx = this.ctx;
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  run() {
    let last = performance.now();
    const loop = (now: number) => {
      if (this.over) return;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() { cancelAnimationFrame(this.raf); }
}

// ── React Component ───────────────────────────────────────────────────────────
export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const keysRef = useRef<Set<string>>(new Set());

  const [screen, setScreen] = useState<"setup" | "playing" | "gameover">("setup");
  const [numPlayers, setNumPlayers] = useState(3);
  const [gameMode, setGameMode] = useState<Mode>("elimination");
  const [hudPlayers, setHudPlayers] = useState<Player[]>([]);
  const [hudRules, setHudRules] = useState<ActiveRules>({});
  const [hudElapsed, setHudElapsed] = useState(0);
  const [winner, setWinner] = useState<Player | null>(null);
  const [finalPlayers, setFinalPlayers] = useState<Player[]>([]);
  const [ruleTimer, setRuleTimer] = useState(0);

  // Canvas sizing
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 600 });

  useEffect(() => {
    const update = () => {
      setCanvasSize({ w: window.innerWidth - 224, h: window.innerHeight });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Key handling
  useEffect(() => {
    const down = (e: KeyboardEvent) => { keysRef.current.add(e.code); e.preventDefault(); };
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.code);
    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  const startGame = useCallback(() => {
    if (engineRef.current) engineRef.current.destroy();
    keysRef.current.clear();
    const canvas = canvasRef.current!;
    canvas.width = canvasSize.w;
    canvas.height = canvasSize.h;

    const engine = new GameEngine(
      canvas, numPlayers, gameMode, keysRef.current,
      (players, rules, elapsed) => {
        setHudPlayers([...players]);
        setHudRules({ ...rules });
        setHudElapsed(elapsed);
      },
      (w, players) => {
        setWinner(w);
        setFinalPlayers([...players]);
        setScreen("gameover");
      }
    );
    engineRef.current = engine;
    setScreen("playing");
    engine.run();
  }, [numPlayers, gameMode, canvasSize]);

  const restartGame = useCallback(() => {
    setScreen("setup");
    if (engineRef.current) { engineRef.current.destroy(); engineRef.current = null; }
  }, []);

  const visRules = Object.keys(hudRules).filter(k => !k.startsWith("_"));
  const sortedPlayers = [...hudPlayers].sort((a, b) => b.score - a.score);
  const timeRemaining = gameMode === "timed" ? Math.max(0, 180 - hudElapsed) : null;
  const ruleTimeLeft = Math.max(0, Math.ceil(RULE_INTERVAL - (hudElapsed % RULE_INTERVAL)));

  const medals = ["🥇", "🥈", "🥉", "4️⃣"];

  return (
    <div style={{ display: "flex", width: "100vw", height: "100vh", background: "#0a0a14", fontFamily: "monospace", overflow: "hidden" }}>

      {/* Canvas */}
      <div style={{ flex: 1, position: "relative" }}>
        <canvas ref={canvasRef} width={canvasSize.w} height={canvasSize.h} style={{ display: "block" }} />

        {/* Setup Screen */}
        {screen === "setup" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0a0a14" }}>
            <div style={{ fontSize: 36, fontWeight: "bold", letterSpacing: 6, color: "#e0d0ff", marginBottom: 4 }}>SHAPE SHIFTER</div>
            <div style={{ fontSize: 11, letterSpacing: 10, color: "#443366", marginBottom: 44 }}>A R E N A</div>

            <div style={{ background: "#0d0d1f", border: "1px solid #1e1e3f", borderRadius: 14, padding: "28px 40px", width: 400 }}>
              <Label>PLAYERS</Label>
              <Row>
                {[2, 3, 4].map(n => (
                  <Btn key={n} active={numPlayers === n} onClick={() => setNumPlayers(n)} color="#7060ff">{n}P</Btn>
                ))}
              </Row>

              <Label>MODE</Label>
              <Row>
                <Btn active={gameMode === "elimination"} onClick={() => setGameMode("elimination")} color="#30c090" wide>ELIMINATION</Btn>
                <Btn active={gameMode === "timed"} onClick={() => setGameMode("timed")} color="#30c090" wide>TIMED (3 MIN)</Btn>
              </Row>

              <Label>CONTROLS</Label>
              <div style={{ fontSize: 11, color: "#333355", lineHeight: 2, marginBottom: 8 }}>
                P1 (Circle) — W A S D<br />
                P2 (Triangle) — Arrow keys<br />
                P3 (Square) — I J K L<br />
                P4 (Circle) — Numpad 8 4 5 6
              </div>

              <button onClick={startGame} style={{ width: "100%", marginTop: 20, padding: "14px 0", background: "linear-gradient(135deg,#4030a0,#7060ff)", border: "none", borderRadius: 10, color: "#e0d0ff", fontSize: 14, letterSpacing: 4, cursor: "pointer", fontFamily: "monospace" }}>
                ▶  START GAME
              </button>
            </div>
          </div>
        )}

        {/* Game Over Screen */}
        {screen === "gameover" && winner && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div style={{ fontSize: 40, letterSpacing: 6, color: "#ffe080", marginBottom: 8 }}>GAME OVER</div>
            <div style={{ fontSize: 18, letterSpacing: 2, color: winner.color, marginBottom: 30 }}>🏆 {winner.name} ({winner.shape}) WINS!</div>
            <div style={{ background: "#0d0d1f", border: "1px solid #1e1e3f", borderRadius: 12, padding: "20px 32px", minWidth: 320, marginBottom: 24 }}>
              {[...finalPlayers].sort((a, b) => b.score - a.score).map((p, i) => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: i < finalPlayers.length - 1 ? "1px solid #111133" : "none", color: p.color, fontSize: 13 }}>
                  <span>{medals[i]} {p.name} ({p.shape})</span>
                  <span>{Math.floor(p.score).toLocaleString()} pts</span>
                </div>
              ))}
            </div>
            <button onClick={restartGame} style={{ padding: "12px 40px", background: "#1e1e3f", border: "1px solid #4030a0", borderRadius: 10, color: "#a090e0", fontFamily: "monospace", fontSize: 13, letterSpacing: 2, cursor: "pointer" }}>
              ↺  PLAY AGAIN
            </button>
          </div>
        )}
      </div>

      {/* HUD Panel */}
      <div style={{ width: 224, background: "#0d0d1f", borderLeft: "1px solid #1e1e3f", padding: 12, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ fontSize: 10, letterSpacing: 3, color: "#1e1e3f", marginBottom: 1 }}>SHAPE SHIFTER</div>
        <div style={{ fontSize: 8, letterSpacing: 5, color: "#161630", marginBottom: 14 }}>ARENA</div>

        {timeRemaining !== null && (
          <div style={{ textAlign: "center", fontSize: 20, fontWeight: "bold", color: timeRemaining < 30 ? "#ff4040" : "#ffe080", marginBottom: 12 }}>
            ⏱ {String(Math.floor(timeRemaining / 60)).padStart(2, "0")}:{String(Math.floor(timeRemaining % 60)).padStart(2, "0")}
          </div>
        )}

        <HudLabel>SCOREBOARD</HudLabel>
        {sortedPlayers.map((p, i) => (
          <div key={p.id} style={{ background: "#0a0a14", border: `1px solid ${p.alive ? p.color + "44" : "#1a1a30"}`, borderRadius: 8, padding: "8px 10px", marginBottom: 6 }}>
            <div style={{ fontSize: 11, fontWeight: "bold", color: p.alive ? p.color : "#333355", marginBottom: 3 }}>
              {medals[i]} {p.name} <span style={{ fontSize: 9, color: "#333355" }}>{p.shape.slice(0, 3).toUpperCase()}</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: "bold", color: p.alive ? "#ffe080" : "#2a2040" }}>
              {Math.floor(p.score).toLocaleString()}
            </div>
            {p.alive ? (
              <div style={{ height: 3, background: "#111", borderRadius: 2, marginTop: 5 }}>
                <div style={{ height: "100%", width: `${Math.max(0, p.hp)}%`, background: p.hp > 50 ? "#30c060" : p.hp > 25 ? "#c08030" : "#c03030", borderRadius: 2, transition: "width 0.3s" }} />
              </div>
            ) : (
              <div style={{ fontSize: 9, color: "#c03030", marginTop: 4 }}>ELIMINATED</div>
            )}
          </div>
        ))}

        <HudLabel>ACTIVE RULES</HudLabel>
        {visRules.length > 0 ? visRules.map(r => (
          <div key={r} style={{ background: "#0a0a14", border: "1px solid #2a2050", borderRadius: 8, padding: "7px 10px", marginBottom: 5, fontSize: 10, color: "#a090e0", lineHeight: 1.5 }}>
            {ALL_RULES[r] || r}
            <div style={{ fontSize: 9, color: "#332255", marginTop: 2 }}>Next eval: {ruleTimeLeft}s</div>
          </div>
        )) : (
          <div style={{ fontSize: 10, color: "#1e1e40", padding: "7px 10px" }}>No active rules</div>
        )}

        <div style={{ marginTop: "auto", paddingTop: 12, fontSize: 9, color: "#1a1a30", lineHeight: 1.8 }}>
          ESC — quit<br />
          Collect items to score<br />
          Avoid red enemies
        </div>
      </div>
    </div>
  );
}

// ── Small UI helpers ──────────────────────────────────────────────────────────
function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10, letterSpacing: 2, color: "#443366", marginBottom: 8, marginTop: 18 }}>{children}</div>;
}
function HudLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10, letterSpacing: 2, color: "#333355", marginBottom: 8 }}>{children}</div>;
}
function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>{children}</div>;
}
function Btn({ children, active, onClick, color, wide }: { children: React.ReactNode; active: boolean; onClick: () => void; color: string; wide?: boolean }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: wide ? "10px 8px" : "8px", border: `1px solid ${active ? color : "#1e1e3f"}`,
      borderRadius: 8, background: active ? color + "22" : "#0a0a14",
      color: active ? color : "#555577", cursor: "pointer", fontSize: 12, fontFamily: "monospace",
      transition: "all 0.15s",
    }}>{children}</button>
  );
}
