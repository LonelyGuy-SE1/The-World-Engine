import { Terrain, TERRAIN_COLORS, Agent, AgentAction, Tile } from '../engine/types';
import { World } from '../engine/World';
import { SpeciesRegistry } from '../engine/Agent';

export interface RenderConfig {
  tileSize: number;
  showGrid: boolean;
  showAgentVision: boolean;
  showPheromones: boolean;
  showTemperature: boolean;
  showResources: boolean;
  showHazards: boolean;
  selectedAgentId: number | null;
  temperatureOpacity: number;
  resourceOpacity: number;
  hazardOpacity: number;
  detailedMode: boolean;
}

export const DEFAULT_RENDER_CONFIG: RenderConfig = {
  tileSize: 6,
  showGrid: false,
  showAgentVision: false,
  showPheromones: false,
  showTemperature: false,
  showResources: false,
  showHazards: false,
  selectedAgentId: null,
  temperatureOpacity: 0.6,
  resourceOpacity: 0.4,
  hazardOpacity: 0.5,
  detailedMode: false,
};

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private tileBuffer: HTMLCanvasElement;
  private tileCtx: CanvasRenderingContext2D;
  private overlayBuffer: HTMLCanvasElement;
  private overlayCtx: CanvasRenderingContext2D;

  config: RenderConfig;

  // Camera / viewport
  cameraX: number = 0;
  cameraY: number = 0;
  zoom: number = 1;

  private tilesDirtyTick: number = -1;

  constructor(canvas: HTMLCanvasElement, config: Partial<RenderConfig> = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.config = { ...DEFAULT_RENDER_CONFIG, ...config };

    this.tileBuffer = document.createElement('canvas');
    this.tileCtx = this.tileBuffer.getContext('2d', { alpha: false })!;

    this.overlayBuffer = document.createElement('canvas');
    this.overlayCtx = this.overlayBuffer.getContext('2d')!;
  }

  resize(width: number, height: number): void {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.tilesDirtyTick = -1;
  }

  render(
    world: World,
    agents: Agent[],
    speciesRegistry: SpeciesRegistry,
    tick: number
  ): void {
    const ctx = this.ctx;
    const ts = this.config.tileSize * this.zoom;
    const canvasW = this.canvas.width / (window.devicePixelRatio || 1);
    const canvasH = this.canvas.height / (window.devicePixelRatio || 1);

    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, canvasW, canvasH);

    ctx.save();
    ctx.translate(-this.cameraX * ts, -this.cameraY * ts);

    const startX = Math.max(0, Math.floor(this.cameraX));
    const startY = Math.max(0, Math.floor(this.cameraY));
    const endX = Math.min(world.width, Math.ceil(this.cameraX + canvasW / ts));
    const endY = Math.min(world.height, Math.ceil(this.cameraY + canvasH / ts));

    this.renderTiles(ctx, world, ts, startX, startY, endX, endY);

    if (this.config.showTemperature) {
      this.renderTemperatureOverlay(ctx, world, ts, startX, startY, endX, endY);
    }
    if (this.config.showResources) {
      this.renderResourceOverlay(ctx, world, ts, startX, startY, endX, endY);
    }
    if (this.config.showHazards) {
      this.renderHazardOverlay(ctx, world, ts, startX, startY, endX, endY);
    }

    if (ts >= 16 || this.config.detailedMode) {
      this.renderCreatureSprites(ctx, agents, speciesRegistry, ts, startX, startY, endX, endY, tick);
    } else {
      this.renderAgents(ctx, agents, speciesRegistry, ts, startX, startY, endX, endY);
    }

    if (this.config.selectedAgentId !== null) {
      const selected = agents.find(a => a.id === this.config.selectedAgentId);
      if (selected && selected.alive) {
        this.renderSelection(ctx, selected, ts);
      }
    }

    if (this.config.showGrid && ts >= 8) {
      this.renderGrid(ctx, ts, startX, startY, endX, endY);
    }

    ctx.restore();

    this.renderHUD(ctx, tick, agents.length, world, canvasW, canvasH);
  }

  private renderTiles(
    ctx: CanvasRenderingContext2D, world: World, ts: number,
    sx: number, sy: number, ex: number, ey: number
  ): void {
    for (let y = sy; y < ey; y++) {
      for (let x = sx; x < ex; x++) {
        const tile = world.tileAt(x, y);
        ctx.fillStyle = TERRAIN_COLORS[tile.terrain];
        ctx.fillRect(x * ts, y * ts, ts + 0.5, ts + 0.5);
      }
    }
  }

  private renderTemperatureOverlay(
    ctx: CanvasRenderingContext2D, world: World, ts: number,
    sx: number, sy: number, ex: number, ey: number
  ): void {
    for (let y = sy; y < ey; y++) {
      for (let x = sx; x < ex; x++) {
        const tile = world.tileAt(x, y);
        const t = (tile.temperature + 30) / 70;
        const clamped = Math.max(0, Math.min(1, t));
        if (clamped > 0.5) {
          ctx.fillStyle = `rgba(255, 0, 0, ${(clamped - 0.5) * this.config.temperatureOpacity})`;
        } else {
          ctx.fillStyle = `rgba(0, 0, 255, ${(0.5 - clamped) * this.config.temperatureOpacity})`;
        }
        ctx.fillRect(x * ts, y * ts, ts, ts);
      }
    }
  }

  private renderResourceOverlay(
    ctx: CanvasRenderingContext2D, world: World, ts: number,
    sx: number, sy: number, ex: number, ey: number
  ): void {
    for (let y = sy; y < ey; y++) {
      for (let x = sx; x < ex; x++) {
        const tile = world.tileAt(x, y);
        const r = tile.foodResource / 100;
        ctx.fillStyle = `rgba(0, 255, 0, ${r * this.config.resourceOpacity})`;
        ctx.fillRect(x * ts, y * ts, ts, ts);
      }
    }
  }

  private renderHazardOverlay(
    ctx: CanvasRenderingContext2D, world: World, ts: number,
    sx: number, sy: number, ex: number, ey: number
  ): void {
    for (let y = sy; y < ey; y++) {
      for (let x = sx; x < ex; x++) {
        const tile = world.tileAt(x, y);
        if (tile.hazard > 0) {
          ctx.fillStyle = `rgba(255, 0, 255, ${tile.hazard * this.config.hazardOpacity})`;
          ctx.fillRect(x * ts, y * ts, ts, ts);
        }
      }
    }
  }

  private renderAgents(
    ctx: CanvasRenderingContext2D, agents: Agent[], speciesRegistry: SpeciesRegistry,
    ts: number, sx: number, sy: number, ex: number, ey: number
  ): void {
    const colorCache = new Map<number, string>();
    for (const [id, sp] of speciesRegistry.species) {
      colorCache.set(id, sp.color);
    }
    let lastColor = '';

    if (ts < 4) {
      const dotSize = Math.max(1, ts * 0.8);
      for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        if (!agent.alive) continue;
        if (agent.x < sx || agent.x >= ex || agent.y < sy || agent.y >= ey) continue;
        const color = colorCache.get(agent.species) || '#ffffff';
        if (color !== lastColor) { ctx.fillStyle = color; lastColor = color; }
        ctx.fillRect(agent.x * ts, agent.y * ts, dotSize, dotSize);
      }
    } else {
      for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        if (!agent.alive) continue;
        if (agent.x < sx || agent.x >= ex || agent.y < sy || agent.y >= ey) continue;

        const color = colorCache.get(agent.species) || '#ffffff';
        if (color !== lastColor) { ctx.fillStyle = color; lastColor = color; }

        const size = Math.max(2, ts * 0.4 * agent.genome.traits.size);
        const cx = agent.x * ts + ts / 2;
        const cy = agent.y * ts + ts / 2;
        const isPred = agent.genome.traits.aggressionBias > 0.6;

        if (isPred && ts >= 6) {
          // Predators: diamond/angular shape
          ctx.beginPath();
          ctx.moveTo(cx, cy - size * 1.15);
          ctx.lineTo(cx + size * 0.8, cy);
          ctx.lineTo(cx, cy + size * 1.15);
          ctx.lineTo(cx - size * 0.8, cy);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(cx, cy, size, 0, Math.PI * 2);
          ctx.fill();
        }

        if (ts >= 6) {
          const energyFrac = agent.energy / 100;
          ctx.strokeStyle = energyFrac > 0.5 ? '#4CAF50' : energyFrac > 0.2 ? '#FF9800' : '#F44336';
          ctx.lineWidth = Math.max(1, ts * 0.08);
          ctx.beginPath();
          ctx.arc(cx, cy, size + 1, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * energyFrac);
          ctx.stroke();
        }

        if (ts >= 8 && agent.lastAction <= AgentAction.MoveWest) {
          const dirs = [[0, -1], [0, 1], [1, 0], [-1, 0]];
          const d = dirs[agent.lastAction];
          ctx.strokeStyle = color;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + d[0] * size * 1.5, cy + d[1] * size * 1.5);
          ctx.stroke();
          lastColor = '';
        }
      }
    }
  }

  private renderSelection(ctx: CanvasRenderingContext2D, agent: Agent, ts: number): void {
    const cx = agent.x * ts + ts / 2;
    const cy = agent.y * ts + ts / 2;
    const r = agent.genome.traits.perceptionRadius * ts;

    if (this.config.showAgentVision) {
      ctx.strokeStyle = 'rgba(255, 255, 0, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 255, 0, 0.05)';
      ctx.fill();
    }

    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, ts * 0.6 * agent.genome.traits.size + 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private renderCreatureSprites(
    ctx: CanvasRenderingContext2D, agents: Agent[], speciesRegistry: SpeciesRegistry,
    ts: number, sx: number, sy: number, ex: number, ey: number, tick: number
  ): void {
    // Pre-cache species colors + RGB components
    const colorCache = new Map<number, string>();
    const rgbCache = new Map<number, [number, number, number]>();
    for (const [id, sp] of speciesRegistry.species) {
      colorCache.set(id, sp.color);
      const c = sp.color;
      rgbCache.set(id, [
        parseInt(c.slice(1, 3), 16),
        parseInt(c.slice(3, 5), 16),
        parseInt(c.slice(5, 7), 16)
      ]);
    }

    // LOD thresholds within creature mode
    const showLegs = ts >= 28;
    const showExtra = ts >= 24;
    const showBar = ts >= 12;
    const showLabel = ts >= 40;
    const showEffects = ts >= 20;

    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      if (!a.alive) continue;
      if (a.x < sx || a.x >= ex || a.y < sy || a.y >= ey) continue;

      const color = colorCache.get(a.species) || '#ffffff';
      const rgb = rgbCache.get(a.species) || [255, 255, 255];
      const px = a.x * ts + ts * 0.5;
      const py = a.y * ts + ts * 0.5;

      // Body scale with subtle breathing animation
      const breathe = Math.sin(tick * 0.15 + a.id * 0.7) * 0.02;
      const sc = ts * 0.38 * a.genome.traits.size * (1 + breathe);

      // Fullness affects abdomen size
      const fullness = 0.7 + Math.min(1, a.energy / 80) * 0.3;

      // Facing direction (radians; 0 = east/right)
      const la = a.lastAction;
      let rot = 1.5708; // default south
      if (la === AgentAction.MoveNorth) rot = -1.5708;
      else if (la === AgentAction.MoveSouth) rot = 1.5708;
      else if (la === AgentAction.MoveEast) rot = 0;
      else if (la === AgentAction.MoveWest) rot = 3.14159;

      const isPred = a.genome.traits.aggressionBias > 0.6;
      const moving = la <= AgentAction.MoveWest;
      const phase = moving ? Math.sin(tick * 0.4 + a.id * 1.7) : 0;

      // Color variants for shading
      const r = rgb[0], g = rgb[1], b = rgb[2];
      const dk = `rgb(${(r * 0.6) | 0},${(g * 0.6) | 0},${(b * 0.6) | 0})`;
      const lt = `rgb(${Math.min(255, (r * 1.35) | 0)},${Math.min(255, (g * 1.35) | 0)},${Math.min(255, (b * 1.35) | 0)})`;

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(rot);

      // === Shadow ===
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.beginPath();
      ctx.ellipse(sc * 0.04, sc * 0.06, sc * 0.52, sc * 0.22, 0, 0, 6.2832);
      ctx.fill();

      // === Predator ground glow ===
      if (isPred && showEffects) {
        const glowAlpha = 0.06 + Math.sin(tick * 0.2 + a.id) * 0.02;
        ctx.fillStyle = `rgba(255,30,0,${glowAlpha})`;
        ctx.beginPath();
        ctx.arc(0, 0, sc * 0.65, 0, 6.2832);
        ctx.fill();
      }

      // === Legs (behind body) ===
      if (showLegs) {
        const pairs = isPred ? 3 : 2;
        const legL = sc * (isPred ? 0.55 : 0.38);
        ctx.strokeStyle = dk;
        ctx.lineWidth = Math.max(1, sc * 0.055);
        ctx.lineCap = 'round';
        for (let p = 0; p < pairs; p++) {
          const ox = sc * (-0.15 + p * 0.22);
          const ph = phase * (p & 1 ? -1 : 1);
          const ang = 1.5708 + ph * 0.4;
          const cosA = Math.cos(ang), sinA = Math.sin(ang);
          // Top leg
          ctx.beginPath();
          ctx.moveTo(ox, -sc * 0.14);
          ctx.lineTo(ox - sinA * legL, -sc * 0.14 - cosA * legL);
          ctx.stroke();
          // Bottom leg
          ctx.beginPath();
          ctx.moveTo(ox, sc * 0.14);
          ctx.lineTo(ox - sinA * legL, sc * 0.14 + cosA * legL);
          ctx.stroke();
        }
      }

      // === Abdomen (rear segment) ===
      ctx.fillStyle = dk;
      ctx.beginPath();
      ctx.ellipse(-sc * 0.2, 0, sc * 0.26 * fullness, sc * 0.2 * fullness, 0, 0, 6.2832);
      ctx.fill();

      // Abdomen stripe pattern for predators
      if (isPred && showExtra) {
        ctx.strokeStyle = `rgba(0,0,0,0.15)`;
        ctx.lineWidth = Math.max(0.5, sc * 0.03);
        for (let s2 = 0; s2 < 3; s2++) {
          const sx2 = -sc * 0.32 + s2 * sc * 0.08;
          ctx.beginPath();
          ctx.moveTo(sx2, -sc * 0.12 * fullness);
          ctx.lineTo(sx2, sc * 0.12 * fullness);
          ctx.stroke();
        }
      }

      // === Thorax (middle segment) ===
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(sc * 0.06, 0, sc * 0.22, sc * 0.18, 0, 0, 6.2832);
      ctx.fill();

      // === Head ===
      const hx = sc * 0.3;
      const hr = sc * (isPred ? 0.19 : 0.17);
      ctx.fillStyle = isPred ? dk : color;
      ctx.beginPath();
      ctx.ellipse(hx, 0, hr, hr * 0.85, 0, 0, 6.2832);
      ctx.fill();

      // === Specular highlights (3D effect) ===
      ctx.fillStyle = lt;
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.ellipse(sc * 0.02, -sc * 0.04, sc * 0.1, sc * 0.06, -0.2, 0, 6.2832);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(-sc * 0.18, -sc * 0.06, sc * 0.08, sc * 0.05, -0.15, 0, 6.2832);
      ctx.fill();
      ctx.globalAlpha = 1;

      // === Eyes ===
      const eyeR = Math.max(1.2, sc * 0.06);
      const eyeSpread = hr * 0.48;
      const eyeX = hx + hr * 0.28;

      // Eye whites
      ctx.fillStyle = isPred ? '#ffe8e8' : '#fff';
      ctx.beginPath();
      ctx.arc(eyeX, -eyeSpread, eyeR * 1.4, 0, 6.2832);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(eyeX, eyeSpread, eyeR * 1.4, 0, 6.2832);
      ctx.fill();

      // Pupils (look in movement direction, so forward)
      ctx.fillStyle = isPred ? '#a00' : '#111';
      ctx.beginPath();
      ctx.arc(eyeX + eyeR * 0.35, -eyeSpread, eyeR * (isPred ? 0.75 : 0.6), 0, 6.2832);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(eyeX + eyeR * 0.35, eyeSpread, eyeR * (isPred ? 0.75 : 0.6), 0, 6.2832);
      ctx.fill();

      // Eye shine
      if (eyeR >= 2) {
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.arc(eyeX + eyeR * 0.1, -eyeSpread - eyeR * 0.3, eyeR * 0.3, 0, 6.2832);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(eyeX + eyeR * 0.1, eyeSpread - eyeR * 0.3, eyeR * 0.3, 0, 6.2832);
        ctx.fill();
      }

      // === Mandibles (predators) / Antennae (herbivores) ===
      if (showExtra) {
        if (isPred) {
          // Mandibles: V-shaped pincers
          const ml = sc * 0.22;
          ctx.strokeStyle = dk;
          ctx.lineWidth = Math.max(1, sc * 0.055);
          ctx.lineCap = 'round';
          // Mandible opening from phase
          const mOpen = 0.3 + (la === AgentAction.Attack ? 0.5 : la === AgentAction.Eat ? 0.4 : 0.1) + phase * 0.08;
          ctx.beginPath();
          ctx.moveTo(hx + hr * 0.5, -hr * 0.15);
          ctx.quadraticCurveTo(hx + hr + ml * 0.4, -ml * mOpen * 0.6, hx + hr + ml * 0.8, -ml * mOpen);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(hx + hr * 0.5, hr * 0.15);
          ctx.quadraticCurveTo(hx + hr + ml * 0.4, ml * mOpen * 0.6, hx + hr + ml * 0.8, ml * mOpen);
          ctx.stroke();
          // Mandible tips
          ctx.fillStyle = '#333';
          const tipR = Math.max(0.5, sc * 0.025);
          ctx.beginPath();
          ctx.arc(hx + hr + ml * 0.8, -ml * mOpen, tipR, 0, 6.2832);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(hx + hr + ml * 0.8, ml * mOpen, tipR, 0, 6.2832);
          ctx.fill();
        } else {
          // Antennae: thin curved feelers
          const al = sc * 0.35;
          ctx.strokeStyle = color;
          ctx.lineWidth = Math.max(0.5, sc * 0.025);
          // Gentle wave based on movement
          const wave = Math.sin(tick * 0.3 + a.id * 2.1) * sc * 0.04;
          ctx.beginPath();
          ctx.moveTo(hx + hr * 0.4, -hr * 0.3);
          ctx.quadraticCurveTo(hx + al * 0.5, -al * 0.7 + wave, hx + al, -al * 0.5 + wave);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(hx + hr * 0.4, hr * 0.3);
          ctx.quadraticCurveTo(hx + al * 0.5, al * 0.7 - wave, hx + al, al * 0.5 - wave);
          ctx.stroke();
          // Antenna tip bulbs
          ctx.fillStyle = lt;
          const tipR = Math.max(0.7, sc * 0.028);
          ctx.beginPath();
          ctx.arc(hx + al, -al * 0.5 + wave, tipR, 0, 6.2832);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(hx + al, al * 0.5 - wave, tipR, 0, 6.2832);
          ctx.fill();
        }
      }

      // === Body segment outlines (high detail) ===
      if (showLegs) {
        ctx.strokeStyle = dk;
        ctx.lineWidth = Math.max(0.5, sc * 0.025);
        ctx.beginPath();
        ctx.ellipse(-sc * 0.2, 0, sc * 0.26 * fullness, sc * 0.2 * fullness, 0, 0, 6.2832);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(sc * 0.06, 0, sc * 0.22, sc * 0.18, 0, 0, 6.2832);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(hx, 0, hr, hr * 0.85, 0, 0, 6.2832);
        ctx.stroke();
      }

      // === Attack flash (inside rotated space) ===
      if (la === AgentAction.Attack && showEffects) {
        ctx.fillStyle = 'rgba(255,40,0,0.12)';
        ctx.beginPath();
        ctx.arc(0, 0, sc * 0.7, 0, 6.2832);
        ctx.fill();
      }

      ctx.restore();

      // ===== UI elements (screen-aligned, not rotated) =====

      // Energy bar
      if (showBar) {
        const bw = sc * 1.2;
        const bh = Math.max(2, sc * 0.1);
        const by = py - sc * 0.65;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(px - bw * 0.5, by - bh, bw, bh);
        const ef = Math.min(1, a.energy / 100);
        ctx.fillStyle = ef > 0.5 ? '#4CAF50' : ef > 0.2 ? '#FF9800' : '#F44336';
        ctx.fillRect(px - bw * 0.5, by - bh, bw * ef, bh);
      }

      // Action/mood indicator icon
      if (showExtra) {
        const iy = py - sc * 0.88;
        let icon = '';
        if (la === AgentAction.Attack) icon = '\u2694';
        else if (la === AgentAction.Eat) icon = '\u2726';
        else if (la === AgentAction.Reproduce) icon = '\u2665';
        else if (la === AgentAction.Rest) icon = 'z';
        else if (a.psychology.fear > 0.6) icon = '!';
        else if (a.psychology.hunger > 0.7) icon = '?';
        if (icon) {
          ctx.font = `bold ${Math.max(7, sc * 0.3) | 0}px sans-serif`;
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.textAlign = 'center';
          ctx.fillText(icon, px, iy);
        }
      }

      // Eating particle effect
      if (la === AgentAction.Eat && showEffects) {
        ctx.fillStyle = 'rgba(100,255,100,0.55)';
        for (let p = 0; p < 3; p++) {
          const ang = tick * 0.35 + p * 2.094;
          const dist = sc * 0.5 + Math.sin(tick * 0.6 + p) * sc * 0.06;
          ctx.beginPath();
          ctx.arc(px + Math.cos(ang) * dist, py + Math.sin(ang) * dist, 1.5, 0, 6.2832);
          ctx.fill();
        }
      }

      // Reproduction hearts
      if (la === AgentAction.Reproduce && showEffects) {
        ctx.fillStyle = 'rgba(255,120,200,0.7)';
        ctx.font = `${Math.max(6, sc * 0.22) | 0}px sans-serif`;
        ctx.textAlign = 'center';
        for (let p = 0; p < 2; p++) {
          const ang = tick * 0.25 + p * 3.14159;
          const dist = sc * 0.55 + Math.sin(tick * 0.5 + p) * sc * 0.08;
          ctx.fillText('\u2665', px + Math.cos(ang) * dist, py + Math.sin(ang) * dist);
        }
      }

      // Attack ring
      if (la === AgentAction.Attack && showEffects) {
        ctx.strokeStyle = 'rgba(255,40,40,0.45)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(px, py, sc * 0.8, 0, 6.2832);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Species name label at very high zoom
      if (showLabel) {
        const sp = speciesRegistry.species.get(a.species);
        if (sp) {
          ctx.font = `${Math.max(8, sc * 0.22) | 0}px sans-serif`;
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.textAlign = 'center';
          ctx.fillText(sp.name, px, py + sc * 0.85);
        }
      }
    }
  }


  private renderGrid(
    ctx: CanvasRenderingContext2D, ts: number,
    sx: number, sy: number, ex: number, ey: number
  ): void {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 0.5;
    for (let x = sx; x <= ex; x++) {
      ctx.beginPath();
      ctx.moveTo(x * ts, sy * ts);
      ctx.lineTo(x * ts, ey * ts);
      ctx.stroke();
    }
    for (let y = sy; y <= ey; y++) {
      ctx.beginPath();
      ctx.moveTo(sx * ts, y * ts);
      ctx.lineTo(ex * ts, y * ts);
      ctx.stroke();
    }
  }

  // FPS tracking
  private lastFrameTime: number = 0;
  private frameCount: number = 0;
  private fps: number = 0;
  private fpsUpdateTimer: number = 0;

  private renderHUD(
    ctx: CanvasRenderingContext2D,
    tick: number, agentCount: number, world: World,
    canvasW: number, canvasH: number
  ): void {
    // Update FPS
    const now = performance.now();
    this.frameCount++;
    this.fpsUpdateTimer += now - (this.lastFrameTime || now);
    this.lastFrameTime = now;
    if (this.fpsUpdateTimer >= 500) {
      this.fps = Math.round(this.frameCount * 1000 / this.fpsUpdateTimer);
      this.frameCount = 0;
      this.fpsUpdateTimer = 0;
    }

    const year = Math.floor(tick / world.config.ticksPerYear);
    const day = tick % world.config.ticksPerYear;
    const zoomPct = Math.round(this.zoom * 100);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(8, 8, 240, 64);

    ctx.fillStyle = '#e0e0e0';
    ctx.font = '12px monospace';
    ctx.fillText(`Year ${year}, Day ${day}`, 16, 26);
    ctx.fillText(`Agents: ${agentCount}  |  Tick: ${tick}`, 16, 42);
    const fpsColor = this.fps >= 30 ? '#4CAF50' : this.fps >= 15 ? '#FF9800' : '#F44336';
    ctx.fillStyle = fpsColor;
    ctx.fillText(`FPS: ${this.fps}  |  Zoom: ${zoomPct}%`, 16, 58);
  }

  // --- Camera Controls ---

  pan(dx: number, dy: number): void {
    this.cameraX += dx / (this.config.tileSize * this.zoom);
    this.cameraY += dy / (this.config.tileSize * this.zoom);
  }

  zoomAt(factor: number, screenX: number, screenY: number): void {
    const ts = this.config.tileSize * this.zoom;
    const worldX = this.cameraX + screenX / ts;
    const worldY = this.cameraY + screenY / ts;

    this.zoom = Math.max(0.1, Math.min(24, this.zoom * factor));

    const newTs = this.config.tileSize * this.zoom;
    this.cameraX = worldX - screenX / newTs;
    this.cameraY = worldY - screenY / newTs;
  }

  centerOn(x: number, y: number, canvasW: number, canvasH: number): void {
    const ts = this.config.tileSize * this.zoom;
    this.cameraX = x - canvasW / ts / 2;
    this.cameraY = y - canvasH / ts / 2;
  }

  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    const ts = this.config.tileSize * this.zoom;
    return {
      x: Math.floor(this.cameraX + screenX / ts),
      y: Math.floor(this.cameraY + screenY / ts),
    };
  }
}
