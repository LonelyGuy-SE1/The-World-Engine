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

    this.renderAgents(ctx, agents, speciesRegistry, ts, startX, startY, endX, endY);

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
          ctx.fillStyle = `rgba(255, 0, 0, ${(clamped - 0.5) * 0.6})`;
        } else {
          ctx.fillStyle = `rgba(0, 0, 255, ${(0.5 - clamped) * 0.6})`;
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
        ctx.fillStyle = `rgba(0, 255, 0, ${r * 0.4})`;
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
          ctx.fillStyle = `rgba(255, 0, 255, ${tile.hazard * 0.5})`;
          ctx.fillRect(x * ts, y * ts, ts, ts);
        }
      }
    }
  }

  private renderAgents(
    ctx: CanvasRenderingContext2D, agents: Agent[], speciesRegistry: SpeciesRegistry,
    ts: number, sx: number, sy: number, ex: number, ey: number
  ): void {
    for (const agent of agents) {
      if (!agent.alive) continue;
      if (agent.x < sx || agent.x >= ex || agent.y < sy || agent.y >= ey) continue;

      const sp = speciesRegistry.species.get(agent.species);
      const color = sp?.color || '#ffffff';
      const size = Math.max(2, ts * 0.4 * agent.genome.traits.size);

      const cx = agent.x * ts + ts / 2;
      const cy = agent.y * ts + ts / 2;

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, size, 0, Math.PI * 2);
      ctx.fill();

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

  private renderHUD(
    ctx: CanvasRenderingContext2D,
    tick: number, agentCount: number, world: World,
    canvasW: number, canvasH: number
  ): void {
    const year = Math.floor(tick / world.config.ticksPerYear);
    const day = tick % world.config.ticksPerYear;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(8, 8, 200, 50);

    ctx.fillStyle = '#e0e0e0';
    ctx.font = '12px monospace';
    ctx.fillText(`Year ${year}, Day ${day}`, 16, 26);
    ctx.fillText(`Agents: ${agentCount}  |  Tick: ${tick}`, 16, 44);
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

    this.zoom = Math.max(0.25, Math.min(10, this.zoom * factor));

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
