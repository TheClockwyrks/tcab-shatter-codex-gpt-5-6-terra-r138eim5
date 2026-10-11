import type {
  Game,
  InitApi,
  RenderApi,
  UpdateApi,
} from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import * as C from "./constants";
import type { RockSize } from "./constants";

export const BACKGROUND = "#070b19";
export type Screen = "title" | "howto" | "playing" | "paused" | "gameover";
export type SaucerEdge = "left" | "right";
export type FieldEdge = "top" | "bottom" | "left" | "right";
export interface ShipState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly angle: number;
  readonly thrusting: boolean;
  readonly invuln: number;
  readonly collision: boolean;
  readonly fireCooldown: number;
}
export interface BulletState {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly life: number;
}
export interface RockState {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly size: RockSize;
  readonly spin: number;
  readonly health: number;
  readonly flash: number;
}
export interface SaucerState {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly mind: boolean;
  readonly gun: boolean;
  readonly travel: boolean;
  readonly weave: 1 | -1;
  readonly fireClock: number;
  readonly weaveClock: number;
  readonly age: number;
}
export interface TorpedoState {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly heading: number;
  readonly life: number;
  readonly homing: boolean;
}
export interface ShatterState {
  readonly screen: Screen;
  readonly menuIndex: number;
  readonly score: number;
  readonly lives: number;
  readonly wave: number;
  readonly waveBanner: number;
  readonly ship: ShipState;
  readonly bullets: readonly BulletState[];
  readonly rocks: readonly RockState[];
  readonly saucer: SaucerState | null;
  readonly enemyBullets: readonly BulletState[];
  readonly torpedoes: readonly TorpedoState[];
  readonly torpedoCharge: number;
  readonly waveSpawning: boolean;
  readonly saucerSpawning: boolean;
  readonly saucerClock: number;
  readonly saucerDue: number;
  readonly nextSaucerEdge: SaucerEdge | null;
  readonly nextSaucerRow: number | null;
  readonly nextSaucerAim: number | null;
  readonly nextRockSpeed: number | null;
  readonly nextRecycleEdge: FieldEdge | null;
  readonly tickClock: number;
  readonly nextId: number;
  readonly simTime: number;
  readonly muted: boolean;
}
type Read = DeepReadonly<ShatterState>;
export interface ShatterDebugApi {
  readonly version: number;
  reset(s: Read): ShatterState;
  snapshot(s: Read): Record<string, unknown>;
  reconcile(s: Read): ShatterState;
  menuItemRect(
    s: Read,
    i: number,
  ): { x: number; y: number; w: number; h: number } | null;
  [key: string]: unknown;
}
const wrap = (n: number, m: number) => ((n % m) + m) % m,
  clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const delta = (a: number, b: number, m: number) =>
  wrap(a - b + m / 2, m) - m / 2;
const d = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(delta(a.x, b.x, C.FIELD_W), delta(a.y, b.y, C.FIELD_H));
const move = <T extends { x: number; y: number; vx: number; vy: number }>(
  x: T,
): T => ({
  ...x,
  x: wrap(x.x + x.vx * C.TICK_DT, C.FIELD_W),
  y: wrap(x.y + x.vy * C.TICK_DT, C.FIELD_H),
});
const grav = <T extends { x: number; y: number; vx: number; vy: number }>(
  x: T,
): T => {
  const dx = C.STAR_X - x.x,
    dy = C.STAR_Y - x.y,
    n = Math.hypot(dx, dy) || 1,
    a = C.MU / Math.max(n, C.SOFTEN) ** 2;
  return {
    ...x,
    vx: x.vx + (dx / n) * a * C.TICK_DT,
    vy: x.vy + (dy / n) * a * C.TICK_DT,
  };
};
const freshShip = (): ShipState => ({
  x: C.SAFE_X,
  y: C.SAFE_Y,
  vx: 0,
  vy: 0,
  angle: C.FACE_UP,
  thrusting: false,
  invuln: 0,
  collision: true,
  fireCooldown: 0,
});
const fresh = (muted = false): ShatterState => ({
  screen: "title",
  menuIndex: 0,
  score: 0,
  lives: C.START_LIVES,
  wave: 0,
  waveBanner: 0,
  ship: freshShip(),
  bullets: [],
  rocks: [],
  saucer: null,
  enemyBullets: [],
  torpedoes: [],
  torpedoCharge: 1,
  waveSpawning: true,
  saucerSpawning: true,
  saucerClock: 0,
  saucerDue: C.SAUCER_FIRST_DELAY,
  nextSaucerEdge: null,
  nextSaucerRow: null,
  nextSaucerAim: null,
  nextRockSpeed: null,
  nextRecycleEdge: null,
  tickClock: 0,
  nextId: 1,
  simTime: 0,
  muted,
});
const menu = (s: Read) =>
  s.screen === "title"
    ? C.TITLE_ITEMS
    : s.screen === "paused"
      ? C.PAUSE_ITEMS
      : s.screen === "gameover"
        ? C.GAMEOVER_ITEMS
        : null;
function newGame(s: Read): ShatterState {
  return {
    ...fresh(s.muted),
    screen: "playing",
    wave: 1,
    waveBanner: C.WAVE_BANNER_TIME,
  };
}
function wave(s: ShatterState): ShatterState {
  let id = s.nextId;
  const rocks: RockState[] = [];
  for (let i = 0; i < C.WAVE_BASE_ROCKS + s.wave; i++) {
    let p: { x: number; y: number };
    do {
      p = { x: Math.random() * C.FIELD_W, y: Math.random() * C.FIELD_H };
    } while (
      d(p, s.ship) < C.WAVE_MIN_SHIP_DIST ||
      Math.hypot(p.x - C.STAR_X, p.y - C.STAR_Y) < C.WAVE_MIN_STAR_DIST
    );
    const a = Math.random() * Math.PI * 2,
      sp =
        (s.nextRockSpeed ??
          C.ROCK_SPEED_MIN.large +
            Math.random() * (C.ROCK_SPEED_MAX.large - C.ROCK_SPEED_MIN.large)) *
        (1 + Math.min(C.WAVE_SPEED_CAP, C.WAVE_SPEED_STEP * (s.wave - 1)));
    rocks.push({
      id: id++,
      x: p.x,
      y: p.y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      size: "large",
      spin: a,
      health: 3,
      flash: 0,
    });
  }
  return { ...s, rocks, nextId: id, nextRockSpeed: null };
}
function destroy(
  s: ShatterState,
  r: RockState,
  vx: number,
  vy: number,
  torpedo = false,
): ShatterState {
  let id = s.nextId;
  const rocks = s.rocks.filter((q) => q.id !== r.id) as RockState[],
    child = C.ROCK_CHILD[r.size],
    len = Math.hypot(vx, vy) || 1,
    k = torpedo ? C.TORPEDO_SCATTER : C.SPLIT_KICK;
  if (child)
    for (const sign of [-1, 1]) {
      const ax = (torpedo ? vx : -vy) / len,
        ay = (torpedo ? vy : vx) / len;
      rocks.push({
        id: id++,
        x: r.x,
        y: r.y,
        vx: r.vx + sign * ax * k,
        vy: r.vy + sign * ay * k,
        size: child,
        spin: r.spin,
        health: C.ROCK_HEALTH[child],
        flash: 0,
      });
    }
  const points =
    r.size === "large"
      ? C.SCORE_LARGE
      : r.size === "medium"
        ? C.SCORE_MEDIUM
        : C.SCORE_SMALL;
  return { ...s, rocks, nextId: id, score: s.score + points };
}
function oneTick(
  base: ShatterState,
  ctl: { l: number; r: number; u: number; fire: boolean; torp: boolean },
): ShatterState {
  if (base.screen !== "playing")
    return { ...base, simTime: base.simTime + C.TICK_DT };
  let s: ShatterState = {
      ...base,
      simTime: base.simTime + C.TICK_DT,
      waveBanner: Math.max(0, base.waveBanner - C.TICK_DT),
    },
    sh = {
      ...s.ship,
      angle: s.ship.angle + (ctl.r - ctl.l) * C.SHIP_TURN * C.TICK_DT,
      thrusting: ctl.u > 0,
      invuln: Math.max(0, s.ship.invuln - C.TICK_DT),
      fireCooldown: Math.max(0, s.ship.fireCooldown - 1),
    };
  if (sh.thrusting) {
    sh.vx += Math.cos(sh.angle) * C.SHIP_THRUST * C.TICK_DT;
    sh.vy += Math.sin(sh.angle) * C.SHIP_THRUST * C.TICK_DT;
  }
  const drag = Math.pow(0.5, C.TICK_DT / C.SHIP_DRAG_HALFLIFE),
    speed = Math.hypot((sh.vx *= drag), (sh.vy *= drag));
  if (speed > C.SHIP_MAX) {
    sh.vx *= C.SHIP_MAX / speed;
    sh.vy *= C.SHIP_MAX / speed;
  }
  sh = move(sh);
  let bullets = base.bullets
      .map((q) => move(grav({ ...q, life: q.life - C.TICK_DT })))
      .filter((q) => q.life > 0),
    enemy = base.enemyBullets
      .map((q) => move(grav({ ...q, life: q.life - C.TICK_DT })))
      .filter((q) => q.life > 0),
    rocks = base.rocks.map((q) =>
      move(
        grav({
          ...q,
          spin: q.spin + C.TICK_DT,
          flash: Math.max(0, q.flash - C.TICK_DT),
        }),
      ),
    ),
    torps = base.torpedoes
      .map((q) => move({ ...q, life: q.life - C.TICK_DT }))
      .filter((q) => q.life > 0);
  const saucer = base.saucer;
  if (ctl.fire && sh.fireCooldown === 0 && bullets.length < C.MAX_BULLETS) {
    bullets = [
      ...bullets,
      {
        id: s.nextId,
        x: sh.x + Math.cos(sh.angle) * C.SHIP_R,
        y: sh.y + Math.sin(sh.angle) * C.SHIP_R,
        vx: sh.vx + Math.cos(sh.angle) * C.MUZZLE_SPEED,
        vy: sh.vy + Math.sin(sh.angle) * C.MUZZLE_SPEED,
        life: C.BULLET_LIFE,
      },
    ];
    s = { ...s, nextId: s.nextId + 1 };
    sh.fireCooldown = C.FIRE_INTERVAL_TICKS;
  }
  if (ctl.torp && s.torpedoCharge === 1 && !torps.length) {
    torps = [
      {
        id: s.nextId,
        x: sh.x,
        y: sh.y,
        vx: Math.cos(sh.angle) * C.TORPEDO_SPEED,
        vy: Math.sin(sh.angle) * C.TORPEDO_SPEED,
        heading: sh.angle,
        life: C.TORPEDO_LIFE,
        homing: true,
      },
    ];
    s = { ...s, nextId: s.nextId + 1, torpedoCharge: 0 };
  }
  for (const b of bullets) {
    const r = rocks.find((q) => d(b, q) <= C.BULLET_R + C.ROCK_RADIUS[q.size]);
    if (r) {
      bullets = bullets.filter((q) => q.id !== b.id);
      if (r.health === 1) {
        s = { ...s, rocks };
        s = destroy(s, r, b.vx, b.vy);
      } else
        rocks = rocks.map((q) =>
          q.id === r.id
            ? { ...q, health: q.health - 1, flash: C.HIT_FLASH_TIME }
            : q,
        );
    }
  }
  for (const t of torps) {
    const r = rocks.find((q) => d(t, q) <= C.TORPEDO_R + C.ROCK_RADIUS[q.size]);
    if (r) {
      torps = torps.filter((q) => q.id !== t.id);
      s = { ...s, rocks };
      s = destroy(s, r, t.vx, t.vy, true);
    }
  }
  rocks = rocks.map((q) =>
    Math.hypot(q.x - C.STAR_X, q.y - C.STAR_Y) <=
    C.CORE_R + C.ROCK_RADIUS[q.size]
      ? { ...q, x: Math.random() * C.FIELD_W, y: 0, vy: Math.abs(q.vy) + 50 }
      : q,
  );
  bullets = bullets.filter(
    (q) => Math.hypot(q.x - C.STAR_X, q.y - C.STAR_Y) > C.CORE_R,
  );
  enemy = enemy.filter(
    (q) => Math.hypot(q.x - C.STAR_X, q.y - C.STAR_Y) > C.CORE_R,
  );
  if (
    sh.collision &&
    sh.invuln === 0 &&
    (rocks.some((q) => d(sh, q) <= C.SHIP_R + C.ROCK_RADIUS[q.size]) ||
      enemy.some((q) => d(sh, q) <= C.SHIP_R + C.BULLET_R))
  ) {
    const lives = s.lives - 1;
    if (lives === 0)
      return {
        ...s,
        screen: "gameover",
        lives,
        ship: sh,
        rocks,
        bullets,
        enemyBullets: enemy,
        torpedoes: torps,
        saucer,
      };
    sh = { ...freshShip(), invuln: C.INVULN_TIME };
    s = { ...s, lives };
  }
  s = {
    ...s,
    ship: sh,
    rocks,
    bullets,
    enemyBullets: enemy,
    torpedoes: torps,
    saucer,
    torpedoCharge: clamp(
      s.torpedoCharge + C.TICK_DT / C.TORPEDO_RECHARGE,
      0,
      1,
    ),
  };
  if (base.waveBanner > 0 && s.waveBanner === 0 && s.waveSpawning) s = wave(s);
  else if (!s.waveBanner && !s.rocks.length && s.waveSpawning)
    s = { ...s, wave: s.wave + 1, waveBanner: C.WAVE_BANNER_TIME };
  return s;
}
function snapshot(s: Read): Record<string, unknown> {
  return {
    ...s,
    ship: { ...s.ship, speed: Math.hypot(s.ship.vx, s.ship.vy) },
    rocks: s.rocks.map((r) => ({ ...r, radius: C.ROCK_RADIUS[r.size] })),
    torpedoReady: s.torpedoCharge === 1,
  };
}
function debug(): ShatterDebugApi {
  const f = (s: Read) => fresh(s.muted);
  const api: ShatterDebugApi = {
    version: C.SHATTER_DEBUG_VERSION,
    reset: f,
    snapshot,
    reconcile: (s) => ({ ...s }),
    menuItemRect: (s, i) =>
      menu(s)?.[i] === undefined
        ? null
        : { x: 470, y: 360 + i * 54, w: 340, h: 44 },
  };
  const set = (name: keyof ShatterState) => (s: Read, v: never) => ({
    ...s,
    [name]: v,
  });
  Object.assign(api, {
    setScreen: set("screen"),
    setMenuIndex: set("menuIndex"),
    setScore: set("score"),
    setLives: set("lives"),
    setWave: set("wave"),
    setWaveBanner: set("waveBanner"),
    setWaveSpawning: set("waveSpawning"),
    setSaucerSpawning: set("saucerSpawning"),
    setSaucerDue: set("saucerDue"),
    setTorpedoCharge: set("torpedoCharge"),
    clearRocks: (s: Read) => ({ ...s, rocks: [] }),
    clearBullets: (s: Read) => ({ ...s, bullets: [] }),
    clearEnemyBullets: (s: Read) => ({ ...s, enemyBullets: [] }),
    clearTorpedoes: (s: Read) => ({ ...s, torpedoes: [] }),
    setShipPosition: (s: Read, x: number, y: number) => ({
      ...s,
      ship: { ...s.ship, x, y },
    }),
    setShipVelocity: (s: Read, vx: number, vy: number) => ({
      ...s,
      ship: { ...s.ship, vx, vy },
    }),
    setShipAngle: (s: Read, angle: number) => ({
      ...s,
      ship: { ...s.ship, angle },
    }),
    setShipInvuln: (s: Read, invuln: number) => ({
      ...s,
      ship: { ...s.ship, invuln },
    }),
    setShipCollision: (s: Read, collision: boolean) => ({
      ...s,
      ship: { ...s.ship, collision },
    }),
    addRock: (s: Read, size: RockSize, x: number, y: number) => ({
      ...s,
      rocks: [
        ...s.rocks,
        {
          id: s.nextId,
          x,
          y,
          vx: 0,
          vy: 0,
          size,
          spin: 0,
          health: C.ROCK_HEALTH[size],
          flash: 0,
        },
      ],
      nextId: s.nextId + 1,
    }),
    addBullet: (s: Read, x: number, y: number, vx: number, vy: number) => ({
      ...s,
      bullets: [
        ...s.bullets,
        { id: s.nextId, x, y, vx, vy, life: C.BULLET_LIFE },
      ],
      nextId: s.nextId + 1,
    }),
  });
  return api;
}
export const game: Game<ShatterState, ShatterDebugApi> = {
  initialize(api: InitApi<ShatterState>) {
    C.ACTIONS.forEach((a) => api.input.register(a, C.BINDINGS[a]));
    Object.values(C.CUES).forEach((cue, i) =>
      api.audio.define(cue, { freq: 180 + i * 90, durationMs: 90, gain: 0.12 }),
    );
    api.diagnostics.register("screen", (s) => s.screen);
    api.diagnostics.register("rocks", (s) => s.rocks.length);
    api.diagnostics.register("score", (s) => s.score);
    return [fresh(), debug()];
  },
  update(state: Read, api: UpdateApi, dt: number) {
    let s: ShatterState = {
      ...state,
      muted: api.audio.muted(),
      tickClock: state.tickClock + dt,
    };
    if (api.input.pressed("mute")) api.audio.setMuted(!s.muted);
    if (s.screen === "title" && api.input.pressed("confirm"))
      s = s.menuIndex === 0 ? newGame(s) : { ...s, screen: "howto" };
    else if (
      s.screen === "howto" &&
      (api.input.pressed("confirm") || api.input.pressed("back"))
    )
      s = { ...s, screen: "title", menuIndex: 1 };
    else if (s.screen === "playing" && api.input.pressed("pause"))
      s = { ...s, screen: "paused" };
    else if (s.screen === "paused" && api.input.pressed("pause"))
      s = { ...s, screen: "playing" };
    while (s.tickClock >= C.TICK_DT) {
      s = oneTick(
        { ...s, tickClock: s.tickClock - C.TICK_DT },
        {
          l: api.input.value("left"),
          r: api.input.value("right"),
          u: api.input.value("up"),
          fire: api.input.value("a") > 0,
          torp: api.input.pressed("b"),
        },
      );
    }
    return s;
  },
  render(state: Read, api: RenderApi) {
    const x = api.ctx;
    x.fillStyle = BACKGROUND;
    x.fillRect(0, 0, C.FIELD_W, C.FIELD_H);
    const g = x.createRadialGradient(
      C.STAR_X,
      C.STAR_Y,
      0,
      C.STAR_X,
      C.STAR_Y,
      180,
    );
    g.addColorStop(0, "#fff6ae");
    g.addColorStop(0.17, "#e78932");
    g.addColorStop(1, "transparent");
    x.fillStyle = g;
    x.beginPath();
    x.arc(C.STAR_X, C.STAR_Y, 180, 0, 7);
    x.fill();
    x.fillStyle = "#fff5c5";
    x.beginPath();
    x.arc(C.STAR_X, C.STAR_Y, C.CORE_R, 0, 7);
    x.fill();
    for (const r of state.rocks) {
      x.strokeStyle = r.flash ? "#fff" : "#a9b6cb";
      x.lineWidth = 2;
      x.beginPath();
      x.arc(r.x, r.y, C.ROCK_RADIUS[r.size], 0, 7);
      x.stroke();
    }
    for (const b of state.bullets) {
      x.fillStyle = "#7de9ff";
      x.beginPath();
      x.arc(b.x, b.y, 3, 0, 7);
      x.fill();
    }
    x.save();
    x.translate(state.ship.x, state.ship.y);
    x.rotate(state.ship.angle);
    x.strokeStyle = state.ship.invuln ? "#ffe76b" : "#63e7ff";
    x.lineWidth = 3;
    x.beginPath();
    x.moveTo(18, 0);
    x.lineTo(-13, -11);
    x.lineTo(-8, 0);
    x.lineTo(-13, 11);
    x.closePath();
    x.stroke();
    x.restore();
    if (state.screen === "playing") {
      x.fillStyle = "#eaf5ff";
      x.font = "bold 24px sans-serif";
      x.fillText(String(state.score).padStart(6, "0"), 32, 48);
      x.fillText(
        "TORPEDO " + Math.round(state.torpedoCharge * 100) + "%",
        32,
        105,
      );
      if (state.waveBanner) {
        x.textAlign = "center";
        x.font = "bold 56px sans-serif";
        x.fillText("WAVE " + state.wave, C.FIELD_W / 2, 250);
        x.textAlign = "start";
      }
    } else {
      x.fillStyle = "#eaf5ff";
      x.textAlign = "center";
      x.font = "bold 92px sans-serif";
      x.fillText(
        state.screen === "howto" ? "HOW TO PLAY" : C.TITLE_TEXT,
        640,
        210,
      );
      x.font = "18px sans-serif";
      x.fillText(
        state.screen === "howto"
          ? "ARROWS / WASD turn & thrust   SPACE fire   F torpedo   P / ESC pause   M mute"
          : C.TAGLINE_TEXT,
        640,
        255,
      );
      const items = menu(state);
      if (items) {
        x.font = "bold 28px sans-serif";
        items.forEach((q, i) => {
          x.fillStyle = i === state.menuIndex ? "#63e7ff" : "#eaf5ff";
          x.fillText(q, 640, 395 + i * 54);
        });
      }
      x.textAlign = "start";
    }
  },
};
