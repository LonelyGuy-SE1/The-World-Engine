import { Terrain, Agent, AgentAction, Tile } from '../engine/types';
import { World } from '../engine/World';
import { SpeciesRegistry } from '../engine/Agent';
import {
  spriteManager, speciesSpriteName, plantSpriteForTerrain,
} from './SpriteManager';

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
};

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private tileBuffer: HTMLCanvasElement;
  private tileCtx: CanvasRenderingContext2D;

  config: RenderConfig;

  // Camera / viewport
  cameraX: number = 0;
  cameraY: number = 0;
  zoom: number = 1;
  minZoom: number = 0.02;

  private tilesDirtyTick: number = -1;
  private tileImageData: ImageData | null = null;

  // Sprite → species mapping cache (stable across redraws)
  private speciesSpriteMap: Map<number, string> = new Map();
  private speciesIndexCounter: number = 0;

  // Pre-rasterized sprite caches — keyed by "name@size"
  private spriteCanvasCache: Map<string, HTMLCanvasElement> = new Map();

  constructor(canvas: HTMLCanvasElement, config: Partial<RenderConfig> = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.config = { ...DEFAULT_RENDER_CONFIG, ...config };

    this.tileBuffer = document.createElement('canvas');
    this.tileCtx = this.tileBuffer.getContext('2d', { alpha: false })!;
  }

  /** Call once when world size is known to set appropriate zoom min */
  setWorldBounds(worldWidth: number, worldHeight: number): void {
    this.minZoom = Math.min(0.1, 1 / Math.max(worldWidth, worldHeight));
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
    tick: number,
  ): void {
    const ctx = this.ctx;
    const ts = this.config.tileSize * this.zoom;
    const canvasW = this.canvas.width / (window.devicePixelRatio || 1);
    const canvasH = this.canvas.height / (window.devicePixelRatio || 1);

    ctx.fillStyle = '#0c0a08';
    ctx.fillRect(0, 0, canvasW, canvasH);

    ctx.save();
    ctx.translate(-this.cameraX * ts, -this.cameraY * ts);

    const startX = Math.max(0, Math.floor(this.cameraX));
    const startY = Math.max(0, Math.floor(this.cameraY));
    const endX = Math.min(world.width, Math.ceil(this.cameraX + canvasW / ts));
    const endY = Math.min(world.height, Math.ceil(this.cameraY + canvasH / ts));

    // Tile cache: rebuild via ImageData every 5 sim ticks
    if ((tick - this.tilesDirtyTick) >= 5 || this.tilesDirtyTick < 0) {
      this.updateTileCache(world);
      this.tilesDirtyTick = tick;
    }

    // Draw terrain
    const prevSmooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      this.tileBuffer,
      startX, startY, endX - startX, endY - startY,
      startX * ts, startY * ts, (endX - startX) * ts, (endY - startY) * ts,
    );
    ctx.imageSmoothingEnabled = prevSmooth;

    // Food dots at medium zoom
    if (ts >= 10 && ts < 24) {
      this.renderFoodDots(ctx, world, ts, startX, startY, endX, endY);
    }

    // Season tint
    const tpy = world.config.ticksPerYear;
    const season = Math.floor((tick % tpy) / (tpy / 4));
    const seasonTints = [
      'rgba(60, 180, 80, 0.04)',
      'rgba(255, 220, 100, 0.04)',
      'rgba(200, 120, 40, 0.05)',
      'rgba(100, 140, 220, 0.06)',
    ];
    ctx.fillStyle = seasonTints[season];
    ctx.fillRect(startX * ts, startY * ts, (endX - startX) * ts, (endY - startY) * ts);

    // Overlays
    if (this.config.showTemperature)
      this.renderOverlay(ctx, world, ts, startX, startY, endX, endY, 'temperature');
    if (this.config.showResources)
      this.renderOverlay(ctx, world, ts, startX, startY, endX, endY, 'resource');
    if (this.config.showHazards)
      this.renderOverlay(ctx, world, ts, startX, startY, endX, endY, 'hazard');

    // Plant/tree sprites at medium+ zoom
    if (ts >= 16) {
      this.renderWorldObjects(ctx, world, ts, startX, startY, endX, endY);
    }

    // Render agents — auto-select detail level based on zoom
    if (ts >= 20) {
      this.renderSpriteAgents(ctx, agents, speciesRegistry, ts, startX, startY, endX, endY, tick);
    } else {
      this.renderDotAgents(ctx, agents, speciesRegistry, ts, startX, startY, endX, endY);
    }

    // Selected agent
    if (this.config.selectedAgentId !== null) {
      const selected = agents.find(a => a.id === this.config.selectedAgentId);
      if (selected && selected.alive) {
        this.renderSelection(ctx, selected, ts, tick);
      }
    }

    if (this.config.showGrid && ts >= 8) {
      this.renderGrid(ctx, ts, startX, startY, endX, endY);
    }

    ctx.restore();
    this.renderHUD(ctx, tick, agents.length, world, canvasW, canvasH);
  }

  // ───────────── Terrain ─────────────

  private static TERRAIN_RGB: [number, number, number][] = [
    [10, 50, 140],    // DeepWater
    [20, 100, 190],   // ShallowWater
    [200, 180, 80],   // Sand
    [60, 150, 55],    // Grass
    [30, 100, 35],    // Forest
    [100, 95, 90],    // Mountain
    [220, 225, 230],  // Snow
  ];

  private updateTileCache(world: World): void {
    const w = world.width;
    const h = world.height;
    if (!this.tileImageData || this.tileImageData.width !== w || this.tileImageData.height !== h) {
      this.tileImageData = new ImageData(w, h);
      this.tileBuffer.width = w;
      this.tileBuffer.height = h;
    }
    const data = this.tileImageData.data;
    const rgb = CanvasRenderer.TERRAIN_RGB;
    const tiles = world.tiles;
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      const x = i % w;
      const y = (i / w) | 0;
      const t = tile.terrain;
      const base = rgb[t];
      const elev = tile.elevation;
      const hv = ((x * 374761393 + y * 668265263) ^ (x * 1274126177)) >>> 0;
      const n = (hv & 0xff) / 255;
      let r = base[0], g = base[1], b = base[2];
      if (t <= 1) {
        const depthDark = t === 0 ? (1 - elev * 1.2) : 1;
        r = (r * depthDark + n * 8) | 0;
        g = (g * depthDark + n * 10) | 0;
        b = Math.min(255, (b * depthDark + n * 15 + tile.waterResource * 0.15) | 0);
      } else if (t === 3) {
        const lush = tile.fertility * 0.3 + tile.humidity * 0.2;
        r = (r - n * 12 - lush * 15) | 0;
        g = Math.min(220, (g + lush * 40 + n * 15 - (1 - tile.foodResource / 100) * 20) | 0);
        b = (b + n * 8 - 10) | 0;
      } else if (t === 4) {
        const lush = tile.fertility * 0.4;
        r = (r - 8 + n * 10) | 0;
        g = Math.min(180, (g + lush * 25 + n * 15) | 0);
        b = (b - 5 + n * 8) | 0;
      } else if (t === 2) {
        r = (r + n * 20 - 10 + tile.humidity * 10) | 0;
        g = (g + n * 15 - 8) | 0;
        b = (b + n * 15 + tile.humidity * 30) | 0;
      } else if (t === 5) {
        const snowCap = tile.temperature < -5 ? 0.3 : 0;
        r = Math.min(255, (r + elev * 30 + n * 20 + snowCap * 120) | 0);
        g = Math.min(255, (g + elev * 25 + n * 15 + snowCap * 120) | 0);
        b = Math.min(255, (b + elev * 20 + n * 10 + snowCap * 120) | 0);
      } else if (t === 6) {
        const sparkle = n > 0.9 ? 15 : 0;
        r = Math.min(255, (r + n * 10 + sparkle) | 0);
        g = Math.min(255, (g + n * 8 + sparkle) | 0);
        b = Math.min(255, (b + n * 6 + sparkle) | 0);
      }
      r = r < 0 ? 0 : r > 255 ? 255 : r;
      g = g < 0 ? 0 : g > 255 ? 255 : g;
      b = b < 0 ? 0 : b > 255 ? 255 : b;
      const pi = i * 4;
      data[pi] = r;
      data[pi + 1] = g;
      data[pi + 2] = b;
      data[pi + 3] = 255;
    }
    this.tileCtx.putImageData(this.tileImageData, 0, 0);
  }

  // ───────────── World objects (plants, trees) ─────────────

  private renderWorldObjects(
    ctx: CanvasRenderingContext2D, world: World, ts: number,
    sx: number, sy: number, ex: number, ey: number,
  ): void {
    if (!spriteManager.ready) return;

    const budget = Math.min(800, (ex - sx) * (ey - sy));
    let drawn = 0;

    for (let y = sy; y < ey && drawn < budget; y++) {
      for (let x = sx; x < ex && drawn < budget; x++) {
        const tile = world.tileAt(x, y);
        if (tile.terrain <= 1 || tile.foodResource < 25) continue;

        // Deterministic sparse placement
        const hash = ((x * 374761393 + y * 668265263) >>> 0) & 0xfff;
        const sparsity = tile.terrain === 4 ? 0x300 :
          tile.terrain === 3 ? 0x500 : 0x800;
        if (hash > sparsity) continue;

        const spriteName = plantSpriteForTerrain(
          tile.terrain, tile.temperature, tile.humidity, tile.foodResource,
        );
        const img = spriteManager.getPlant(spriteName);
        if (!img) continue;

        const spriteSize = ts * 0.75;
        const px = x * ts + (ts - spriteSize) * 0.5;
        const py = y * ts + (ts - spriteSize) * 0.5;
        ctx.globalAlpha = 0.8;
        ctx.drawImage(img, px, py, spriteSize, spriteSize);
        drawn++;
      }
    }
    ctx.globalAlpha = 1;
  }

  // ───────────── Dot agents (far zoom) ─────────────

  private renderDotAgents(
    ctx: CanvasRenderingContext2D, agents: Agent[], speciesRegistry: SpeciesRegistry,
    ts: number, sx: number, sy: number, ex: number, ey: number,
  ): void {
    const colorCache = new Map<number, string>();
    for (const [id, sp] of speciesRegistry.species) {
      colorCache.set(id, sp.color);
    }
    let lastColor = '';

    if (ts < 4) {
      const dotSize = Math.max(1, ts * 0.8);
      for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        if (!a.alive || a.x < sx || a.x >= ex || a.y < sy || a.y >= ey) continue;
        const color = colorCache.get(a.species) || '#ffffff';
        if (color !== lastColor) { ctx.fillStyle = color; lastColor = color; }
        ctx.fillRect(a.x * ts, a.y * ts, dotSize, dotSize);
      }
    } else {
      for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        if (!a.alive || a.x < sx || a.x >= ex || a.y < sy || a.y >= ey) continue;
        const color = colorCache.get(a.species) || '#ffffff';
        if (color !== lastColor) { ctx.fillStyle = color; lastColor = color; }

        const size = Math.max(2, ts * 0.35 * a.genome.traits.size);
        const cx = a.x * ts + ts / 2;
        const cy = a.y * ts + ts / 2;
        const isPred = a.genome.traits.aggressionBias > 0.6;

        if (isPred && ts >= 6) {
          ctx.beginPath();
          ctx.moveTo(cx, cy - size * 1.15);
          ctx.lineTo(cx + size * 0.8, cy);
          ctx.lineTo(cx, cy + size * 1.15);
          ctx.lineTo(cx - size * 0.8, cy);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(cx, cy, size, 0, 6.2832);
          ctx.fill();
        }

        // Energy ring at medium zoom
        if (ts >= 6) {
          const ef = a.energy / 100;
          ctx.strokeStyle = ef > 0.5 ? '#4CAF50' : ef > 0.2 ? '#FF9800' : '#F44336';
          ctx.lineWidth = Math.max(1, ts * 0.06);
          ctx.beginPath();
          ctx.arc(cx, cy, size + 1, -1.5708, -1.5708 + 6.2832 * ef);
          ctx.stroke();
        }
      }
    }
  }

  // ───────────── Sprite agents (close zoom) ─────────────

  private getSpriteForSpecies(speciesId: number): string {
    let name = this.speciesSpriteMap.get(speciesId);
    if (!name) {
      name = speciesSpriteName(this.speciesIndexCounter++);
      this.speciesSpriteMap.set(speciesId, name);
    }
    return name;
  }

  private getRasterized(img: HTMLImageElement, name: string, size: number): HTMLCanvasElement {
    const roundSize = Math.round(size);
    const key = `${name}@${roundSize}`;
    let cached = this.spriteCanvasCache.get(key);
    if (cached) return cached;

    if (this.spriteCanvasCache.size > 200) {
      this.spriteCanvasCache.clear();
    }

    cached = document.createElement('canvas');
    cached.width = roundSize;
    cached.height = roundSize;
    const cctx = cached.getContext('2d')!;
    cctx.drawImage(img, 0, 0, roundSize, roundSize);
    this.spriteCanvasCache.set(key, cached);
    return cached;
  }

  private renderSpriteAgents(
    ctx: CanvasRenderingContext2D, agents: Agent[], speciesRegistry: SpeciesRegistry,
    ts: number, sx: number, sy: number, ex: number, ey: number, tick: number,
  ): void {
    if (!spriteManager.ready) {
      this.renderDotAgents(ctx, agents, speciesRegistry, ts, sx, sy, ex, ey);
      return;
    }

    const showBar = ts >= 14;
    const showEffects = ts >= 22;
    const showLabel = ts >= 44;
    const showThought = ts >= 32;

    const visibleTiles = (ex - sx) * (ey - sy);
    const MAX_SPRITES = Math.min(800, Math.max(200, Math.floor(visibleTiles * 0.5)));
    let rendered = 0;

    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      if (!a.alive) continue;
      if (a.x < sx || a.x >= ex || a.y < sy || a.y >= ey) continue;
      if (++rendered > MAX_SPRITES) break;

      const spriteName = this.getSpriteForSpecies(a.species);
      const img = spriteManager.getCreature(spriteName);

      const px = a.x * ts + ts * 0.5;
      const py = a.y * ts + ts * 0.5;
      const spriteSize = Math.round(ts * 0.78 * Math.min(1.6, a.genome.traits.size));

      if (img) {
        const raster = this.getRasterized(img, spriteName, spriteSize);
        const bob = Math.sin(tick * 0.12 + a.id * 0.7) * ts * 0.02;
        const facingLeft = a.lastAction === AgentAction.MoveWest;

        ctx.save();
        ctx.translate(px, py + bob);
        if (facingLeft) ctx.scale(-1, 1);
        ctx.drawImage(raster, -spriteSize / 2, -spriteSize / 2);
        ctx.restore();
      } else {
        const sp = speciesRegistry.species.get(a.species);
        ctx.fillStyle = sp?.color || '#fff';
        ctx.beginPath();
        ctx.arc(px, py, spriteSize / 2, 0, 6.2832);
        ctx.fill();
      }

      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.beginPath();
      ctx.ellipse(px, py + spriteSize * 0.4, spriteSize * 0.3, spriteSize * 0.1, 0, 0, 6.2832);
      ctx.fill();

      // Energy bar
      if (showBar) {
        const bw = spriteSize * 0.9;
        const bh = Math.max(2, ts * 0.06);
        const by = py - spriteSize * 0.55;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(px - bw * 0.5, by, bw, bh);
        const ef = Math.min(1, a.energy / 100);
        ctx.fillStyle = ef > 0.5 ? '#4CAF50' : ef > 0.2 ? '#FF9800' : '#F44336';
        ctx.fillRect(px - bw * 0.5, by, bw * ef, bh);
      }

      // Thought bubble
      if (showThought) {
        this.renderThoughtBubble(ctx, a, px, py, spriteSize, ts, tick);
      }

      // Action effect sprites
      if (showEffects) {
        this.renderActionEffects(ctx, a, px, py, spriteSize, ts, tick);
      }

      // Species name label
      if (showLabel) {
        const sp = speciesRegistry.species.get(a.species);
        if (sp) {
          ctx.font = `${Math.max(8, ts * 0.14) | 0}px sans-serif`;
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.textAlign = 'center';
          ctx.fillText(sp.name, px, py + spriteSize * 0.6);
        }
      }
    }
  }

  private renderThoughtBubble(
    ctx: CanvasRenderingContext2D, a: Agent,
    px: number, py: number, spriteSize: number, ts: number, tick: number,
  ): void {
    let effectName: string | null = null;

    if (a.lastAction === AgentAction.Attack) effectName = 'swords';
    else if (a.lastAction === AgentAction.Rest) effectName = 'sleep';
    else if (a.lastAction === AgentAction.Reproduce) effectName = 'heart';
    else if (a.psychology.fear > 0.6) effectName = 'exclamation';
    else if (a.psychology.hunger > 0.75) effectName = 'question';
    else if (a.lastAction === AgentAction.Eat || a.lastAction === AgentAction.Drink)
      effectName = 'sparkles';

    if (!effectName) return;

    const img = spriteManager.getEffect(effectName);
    if (!img) return;

    const iconSize = Math.max(10, ts * 0.28);
    const floatY = Math.sin(tick * 0.15 + a.id) * ts * 0.03;
    ctx.globalAlpha = 0.85;
    ctx.drawImage(img, px - iconSize * 0.5, py - spriteSize * 0.65 + floatY - iconSize, iconSize, iconSize);
    ctx.globalAlpha = 1;
  }

  private renderActionEffects(
    ctx: CanvasRenderingContext2D, a: Agent,
    px: number, py: number, spriteSize: number, ts: number, tick: number,
  ): void {
    if (a.lastAction === AgentAction.Eat) {
      const img = spriteManager.getEffect('sparkles');
      if (img) {
        const s = Math.max(6, ts * 0.15);
        for (let p = 0; p < 2; p++) {
          const ang = tick * 0.3 + p * 3.14;
          const dist = spriteSize * 0.4;
          ctx.globalAlpha = 0.6;
          ctx.drawImage(img, px + Math.cos(ang) * dist - s / 2, py + Math.sin(ang) * dist - s / 2, s, s);
        }
        ctx.globalAlpha = 1;
      }
    }

    if (a.lastAction === AgentAction.Attack) {
      const img = spriteManager.getEffect('collision');
      if (img) {
        const s = Math.max(10, ts * 0.3);
        ctx.globalAlpha = 0.7;
        ctx.drawImage(img, px + spriteSize * 0.3 - s / 2, py - s / 2, s, s);
        ctx.globalAlpha = 1;
      }
    }

    if (a.lastAction === AgentAction.Drink) {
      const img = spriteManager.getObject('droplet');
      if (img) {
        const s = Math.max(8, ts * 0.18);
        const floatY = Math.sin(tick * 0.2 + a.id) * ts * 0.02;
        ctx.globalAlpha = 0.75;
        ctx.drawImage(img, px + spriteSize * 0.2, py - spriteSize * 0.3 + floatY, s, s);
        ctx.globalAlpha = 1;
      }
    }
  }

  // ───────────── Selection ─────────────

  private renderSelection(ctx: CanvasRenderingContext2D, agent: Agent, ts: number, tick: number): void {
    const cx = agent.x * ts + ts / 2;
    const cy = agent.y * ts + ts / 2;

    if (this.config.showAgentVision) {
      const r = agent.genome.traits.perceptionRadius * ts;
      ctx.strokeStyle = 'rgba(255, 255, 0, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, 6.2832);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 255, 0, 0.05)';
      ctx.fill();
    }

    const pulse = 1 + Math.sin(tick * 0.1) * 0.1;
    const selR = ts * 0.55 * agent.genome.traits.size * pulse + 3;
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, selR, 0, 6.2832);
    ctx.stroke();
    ctx.setLineDash([]);

    if (ts >= 24) {
      this.renderAgentTooltip(ctx, agent, cx, cy, ts);
    }
  }

  private renderAgentTooltip(
    ctx: CanvasRenderingContext2D, a: Agent,
    cx: number, cy: number, ts: number,
  ): void {
    const w = Math.max(100, ts * 3);
    const h = ts * 2.5;
    const x = cx + ts * 0.8;
    const y = cy - h / 2;

    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fff';
    const fontSize = Math.max(8, ts * 0.16);
    ctx.font = `${fontSize | 0}px monospace`;
    const lineH = fontSize * 1.4;
    let ly = y + lineH;
    ctx.fillText(`ID: ${a.id}  Gen: ${a.generation}`, x + 4, ly); ly += lineH;
    ctx.fillText(`HP: ${a.health.toFixed(0)}/${a.maxHealth.toFixed(0)}  E: ${a.energy.toFixed(0)}`, x + 4, ly); ly += lineH;
    ctx.fillText(`Age: ${a.age}/${a.maxAge}  Kills: ${a.kills}`, x + 4, ly); ly += lineH;
    ctx.fillText(`H:${a.psychology.hunger.toFixed(1)} T:${a.psychology.thirst.toFixed(1)} F:${a.psychology.fear.toFixed(1)}`, x + 4, ly); ly += lineH;
    ctx.fillText(`Spd:${a.genome.traits.speed.toFixed(1)} Sz:${a.genome.traits.size.toFixed(1)} Agg:${a.genome.traits.aggressionBias.toFixed(1)}`, x + 4, ly);
  }

  // ───────────── Overlays ─────────────

  private renderOverlay(
    ctx: CanvasRenderingContext2D, world: World, ts: number,
    sx: number, sy: number, ex: number, ey: number,
    type: 'temperature' | 'resource' | 'hazard',
  ): void {
    for (let y = sy; y < ey; y++) {
      for (let x = sx; x < ex; x++) {
        const tile = world.tileAt(x, y);
        let fillStyle: string;

        if (type === 'temperature') {
          const t = (tile.temperature + 30) / 70;
          const c = Math.max(0, Math.min(1, t));
          fillStyle = c > 0.5
            ? `rgba(255,0,0,${(c - 0.5) * this.config.temperatureOpacity})`
            : `rgba(0,0,255,${(0.5 - c) * this.config.temperatureOpacity})`;
        } else if (type === 'resource') {
          const r = tile.foodResource / 100;
          fillStyle = `rgba(0,255,0,${r * this.config.resourceOpacity})`;
        } else {
          if (tile.hazard <= 0) continue;
          fillStyle = `rgba(255,0,255,${tile.hazard * this.config.hazardOpacity})`;
        }

        ctx.fillStyle = fillStyle;
        ctx.fillRect(x * ts, y * ts, ts, ts);
      }
    }
  }

  // ───────────── Food dots ─────────────

  private renderFoodDots(
    ctx: CanvasRenderingContext2D, world: World, ts: number,
    sx: number, sy: number, ex: number, ey: number,
  ): void {
    const hash = (a: number, b: number) =>
      (((a * 374761393 + b * 668265263) ^ (a * 1274126177)) >>> 0 & 0xff) / 255;
    for (let y = sy; y < ey; y++) {
      for (let x = sx; x < ex; x++) {
        const tile = world.tileAt(x, y);
        if (tile.foodResource <= 30 || tile.terrain === Terrain.DeepWater) continue;
        const foodAlpha = Math.min(0.6, tile.foodResource / 150);
        ctx.fillStyle = `rgba(180,255,60,${foodAlpha})`;
        const dotR = Math.max(1, ts * 0.08);
        const dots = tile.foodResource > 70 ? 3 : tile.foodResource > 45 ? 2 : 1;
        for (let d = 0; d < dots; d++) {
          const dx = hash(x + d * 7, y + d * 3) * ts * 0.7 + ts * 0.15;
          const dy = hash(x + d * 11, y + d * 5) * ts * 0.7 + ts * 0.15;
          ctx.fillRect(x * ts + dx, y * ts + dy, dotR, dotR);
        }
      }
    }
  }

  // ───────────── Grid ─────────────

  private renderGrid(
    ctx: CanvasRenderingContext2D, ts: number,
    sx: number, sy: number, ex: number, ey: number,
  ): void {
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
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

  // ───────────── HUD ─────────────

  private lastFrameTime: number = 0;
  private frameCount: number = 0;
  private fps: number = 0;
  private fpsUpdateTimer: number = 0;

  private renderHUD(
    ctx: CanvasRenderingContext2D,
    tick: number, agentCount: number, world: World,
    canvasW: number, canvasH: number,
  ): void {
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
    ctx.fillRect(8, 8, 250, 64);

    ctx.fillStyle = '#e0e0e0';
    ctx.font = '12px monospace';
    ctx.fillText(`Year ${year}, Day ${day}`, 16, 26);
    ctx.fillText(`Agents: ${agentCount}  |  Tick: ${tick}`, 16, 42);
    const fpsColor = this.fps >= 30 ? '#4CAF50' : this.fps >= 15 ? '#FF9800' : '#F44336';
    ctx.fillStyle = fpsColor;
    ctx.fillText(`FPS: ${this.fps}  |  Zoom: ${zoomPct}%`, 16, 58);
  }

  // ───────────── Camera controls ─────────────

  pan(dx: number, dy: number): void {
    this.cameraX += dx / (this.config.tileSize * this.zoom);
    this.cameraY += dy / (this.config.tileSize * this.zoom);
  }

  zoomAt(factor: number, screenX: number, screenY: number): void {
    const ts = this.config.tileSize * this.zoom;
    const worldX = this.cameraX + screenX / ts;
    const worldY = this.cameraY + screenY / ts;

    this.zoom = Math.max(this.minZoom, Math.min(30, this.zoom * factor));

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
