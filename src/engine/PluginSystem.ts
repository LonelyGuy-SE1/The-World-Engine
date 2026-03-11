import { Agent, Tile, Traits, Intervention, SeededRandom } from './types';
import { World } from './World';
import { SimulationInstance, Simulation } from './Simulation';
import { SpeciesRegistry } from './Agent';

// --- Plugin Interface ---

export interface Plugin {
  id: string;
  name: string;
  version: string;
  description?: string;

  onRegister?(ctx: PluginContext): void;
  onUnregister?(ctx: PluginContext): void;
  onTick?(ctx: PluginContext, instance: SimulationInstance): void;
  onAgentBorn?(ctx: PluginContext, agent: Agent, instance: SimulationInstance): void;
  onAgentDied?(ctx: PluginContext, agent: Agent, instance: SimulationInstance): void;
  onEnvironmentUpdate?(ctx: PluginContext, world: World, tick: number): void;
  tileModifier?(tile: Tile, x: number, y: number, tick: number): void;
  agentModifier?(agent: Agent, tile: Tile, tick: number): void;
  customInterventions?: Record<string, (params: Record<string, any>, instance: SimulationInstance) => void>;
}

// --- Plugin Context ---

export interface PluginContext {
  simulation: Simulation;
  log(message: string): void;
  registerIntervention(name: string, handler: (params: Record<string, any>, inst: SimulationInstance) => void): void;
  registerSpeciesArchetype(name: string, traits: Partial<Traits>): void;
  rng: SeededRandom;
}

// --- Plugin Manager ---

export class PluginManager {
  private plugins: Map<string, Plugin> = new Map();
  private customInterventions: Map<string, (params: Record<string, any>, inst: SimulationInstance) => void> = new Map();
  private speciesArchetypes: Map<string, Partial<Traits>> = new Map();
  private logs: string[] = [];
  private simulation: Simulation;

  constructor(simulation: Simulation) {
    this.simulation = simulation;
  }

  register(plugin: Plugin): void {
    if (this.plugins.has(plugin.id)) {
      console.warn(`Plugin '${plugin.id}' already registered. Replacing.`);
      this.unregister(plugin.id);
    }

    this.plugins.set(plugin.id, plugin);

    const ctx = this.createContext();
    plugin.onRegister?.(ctx);

    // Register custom interventions
    if (plugin.customInterventions) {
      for (const [name, handler] of Object.entries(plugin.customInterventions)) {
        this.customInterventions.set(`${plugin.id}:${name}`, handler);
      }
    }

    console.log(`Plugin '${plugin.name}' v${plugin.version} registered.`);
  }

  unregister(pluginId: string): void {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;

    const ctx = this.createContext();
    plugin.onUnregister?.(ctx);

    // Remove custom interventions
    for (const key of this.customInterventions.keys()) {
      if (key.startsWith(`${pluginId}:`)) {
        this.customInterventions.delete(key);
      }
    }

    this.plugins.delete(pluginId);
  }

  getPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  executeTick(instance: SimulationInstance): void {
    const ctx = this.createContext();
    for (const plugin of this.plugins.values()) {
      try {
        plugin.onTick?.(ctx, instance);
      } catch (e) {
        console.error(`Plugin '${plugin.id}' tick error:`, e);
      }
    }
  }

  executeAgentBorn(agent: Agent, instance: SimulationInstance): void {
    const ctx = this.createContext();
    for (const plugin of this.plugins.values()) {
      try {
        plugin.onAgentBorn?.(ctx, agent, instance);
      } catch (e) {
        console.error(`Plugin '${plugin.id}' agentBorn error:`, e);
      }
    }
  }

  executeAgentDied(agent: Agent, instance: SimulationInstance): void {
    const ctx = this.createContext();
    for (const plugin of this.plugins.values()) {
      try {
        plugin.onAgentDied?.(ctx, agent, instance);
      } catch (e) {
        console.error(`Plugin '${plugin.id}' agentDied error:`, e);
      }
    }
  }

  executeEnvironmentUpdate(world: World, tick: number): void {
    const ctx = this.createContext();
    for (const plugin of this.plugins.values()) {
      try {
        plugin.onEnvironmentUpdate?.(ctx, world, tick);
      } catch (e) {
        console.error(`Plugin '${plugin.id}' env update error:`, e);
      }
    }
  }

  applyTileModifiers(tile: Tile, x: number, y: number, tick: number): void {
    for (const plugin of this.plugins.values()) {
      try {
        plugin.tileModifier?.(tile, x, y, tick);
      } catch (e) {
        console.error(`Plugin '${plugin.id}' tile modifier error:`, e);
      }
    }
  }

  applyAgentModifiers(agent: Agent, tile: Tile, tick: number): void {
    for (const plugin of this.plugins.values()) {
      try {
        plugin.agentModifier?.(agent, tile, tick);
      } catch (e) {
        console.error(`Plugin '${plugin.id}' agent modifier error:`, e);
      }
    }
  }

  executeCustomIntervention(name: string, params: Record<string, any>, instance: SimulationInstance): boolean {
    const handler = this.customInterventions.get(name);
    if (handler) {
      try {
        handler(params, instance);
        return true;
      } catch (e) {
        console.error(`Custom intervention '${name}' error:`, e);
      }
    }
    return false;
  }

  getSpeciesArchetypes(): Map<string, Partial<Traits>> {
    return this.speciesArchetypes;
  }

  getLogs(): string[] {
    return this.logs;
  }

  private createContext(): PluginContext {
    return {
      simulation: this.simulation,
      log: (msg: string) => {
        this.logs.push(`[${new Date().toISOString()}] ${msg}`);
        if (this.logs.length > 1000) this.logs.shift();
      },
      registerIntervention: (name, handler) => {
        this.customInterventions.set(name, handler);
      },
      registerSpeciesArchetype: (name, traits) => {
        this.speciesArchetypes.set(name, traits);
      },
      rng: new SeededRandom(Date.now()),
    };
  }
}

export const VolcanicActivityPlugin: Plugin = {
  id: 'volcanic-activity',
  name: 'Volcanic Activity',
  version: '1.0.0',
  description: 'Adds periodic volcanic eruptions that create hazard zones and temperature spikes.',

  onTick(ctx, instance) {
    if (instance.tick % 1000 === 0 && ctx.rng.next() < 0.3) {
      const world = instance.world;
      const cx = ctx.rng.nextInt(10, world.width - 10);
      const cy = ctx.rng.nextInt(10, world.height - 10);
      const radius = ctx.rng.nextInt(5, 15);

      ctx.log(`Volcanic eruption at (${cx}, ${cy}) radius ${radius}`);

      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy <= radius * radius) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (world.isValid(nx, ny)) {
              const tile = world.tileAt(nx, ny);
              const dist = Math.sqrt(dx * dx + dy * dy);
              const intensity = 1 - dist / radius;
              tile.hazard = Math.min(1, tile.hazard + intensity * 0.8);
              tile.temperature += intensity * 30;
              tile.foodResource *= Math.max(0, 1 - intensity);
            }
          }
        }
      }
    }
  },
};

export const SeasonalMigrationPlugin: Plugin = {
  id: 'seasonal-migration',
  name: 'Seasonal Migration',
  version: '1.0.0',
  description: 'Adds seasonal food scarcity that encourages agent migration.',

  tileModifier(tile, x, y, tick) {
    // Create food scarcity waves that move across the map
    const phase = (tick * 0.001 + x * 0.05) % (Math.PI * 2);
    const modifier = 0.5 + Math.sin(phase) * 0.5; // 0–1
    tile.foodResource *= modifier;
  },
};

export const SymbiosisPlugin: Plugin = {
  id: 'symbiosis',
  name: 'Symbiosis',
  version: '1.0.0',
  description: 'Agents of different species sharing a tile can gain mutual energy benefits.',

  agentModifier(agent, tile, tick) {
    if (agent.psychology.socialBonding > 0.5) {
      agent.energy += 0.05 * agent.psychology.socialBonding;
    }
  },
};
