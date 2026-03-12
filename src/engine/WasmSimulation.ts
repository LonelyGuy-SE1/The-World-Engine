/**
 * WasmSimulation — Drop-in replacement for the TS Simulation class,
 * backed by the C++ WebAssembly engine.
 *
 * Produces SimulationInstance-compatible objects so every existing UI
 * component (WorldViewer, ControlPanel, InspectorPanel, DashboardPanel,
 * ExperimentPanel, WorldSelector, MultiWorldViewer) works without changes.
 */

import {
  WorldConfig, DEFAULT_WORLD_CONFIG, WorldStats, SimulationState,
  Agent, AgentAction, Intervention,
  Terrain, Tile, Psychology, Traits, SpeciesInfo,
} from './types';
import { SimulationInstance } from './Simulation';
import { EventLog } from './EventLog';
import { CivilizationSystem } from './Civilization';

/* ──────────────────── WASM Module Interface ──────────────────── */

interface WasmModule {
  createSimulation(w: number, h: number, agents: number, species: number, seed: number): number;
  destroySimulation(): void;
  tickSimulation(count: number): void;
  getAgentCount(): number;
  getTick(): number;
  getWorldWidth(): number;
  getWorldHeight(): number;
  getAgentDataPtr(): number;
  getTileDataPtr(): number;
  getStats(): any;
  getAgentDetail(id: number): number[] | null;
  getSpeciesInfo(): any[];
  applyIntervention(
    type: number, amount: number, multiplier: number, speciesId: number,
    count: number, x: number, y: number, radius: number, intensity: number, eventType: number
  ): void;
  getStatsHistory(): any[];
  HEAPF32: Float32Array;
}

let wasmModule: WasmModule | null = null;
let wasmLoading: Promise<WasmModule> | null = null;

async function loadWasm(): Promise<WasmModule> {
  if (wasmModule) return wasmModule;
  if (wasmLoading) return wasmLoading;

  wasmLoading = (async () => {
    const script = document.createElement('script');
    script.src = '/wasm/engine.js';
    document.head.appendChild(script);
    await new Promise<void>((resolve, reject) => {
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load WASM engine script'));
    });
    const factory = (window as any).WorldEngineModule;
    if (!factory) throw new Error('WorldEngineModule not found on window');
    const mod = await factory();
    wasmModule = mod;
    return mod;
  })();
  return wasmLoading;
}

/** Probe whether the WASM binary is available without fully loading it. */
export async function isWasmAvailable(): Promise<boolean> {
  try {
    const resp = await fetch('/wasm/engine.wasm', { method: 'HEAD' });
    return resp.ok;
  } catch { return false; }
}

/* ──────────────────── Constants ──────────────────── */

const INTERVENTION_TYPE_MAP: Record<string, number> = {
  'temperature_shift': 0, 'resource_multiplier': 1, 'introduce_predator': 2,
  'remove_species': 3, 'mutation_rate_change': 4, 'add_hazard': 5,
  'spawn_custom_agent': 6, 'climate_event': 7,
};
const CLIMATE_EVENT_MAP: Record<string, number> = {
  'ice_age': 0, 'heat_wave': 1, 'flood': 2,
};
const SPECIES_COLORS = [
  '#e6194b','#3cb44b','#ffe119','#4363d8','#f58231',
  '#911eb4','#42d4f4','#f032e6','#bfef45','#fabed4',
  '#469990','#dcbeff','#9a6324','#800000','#aaffc3',
  '#808000','#ffd8b1','#000075',
];
const SPECIES_NAMES = [
  'Aurans','Brizids','Cerulex','Dravori','Elaphon',
  'Flareon','Glyphis','Hexalid','Iridex','Jorvian',
  'Kelpith','Luminex','Morphael','Nyxora','Obelith',
  'Pyralid','Quorath','Riftling',
];

/* ──────────────────── World Proxy ──────────────────── */

/**
 * Lightweight proxy that fulfils the subset of the World interface
 * consumed by all UI components (WorldViewer, CanvasRenderer,
 * InspectorPanel, ControlPanel, ExperimentPanel, DashboardPanel, etc.)
 */
class WasmWorldProxy {
  width: number;
  height: number;
  config: WorldConfig;
  tiles: Tile[] = [];
  rng = { next() { return Math.random(); }, nextFloat(a: number, b: number) { return a + Math.random() * (b - a); }, nextInt(a: number, b: number) { return a + Math.floor(Math.random() * (b - a + 1)); }, nextGaussian() { return 0; } };

  // Properties expected by the renderer / UI
  globalTemperatureOffset: number = 0;
  seasonAngle: number = 0;
  territoryOwner: Int32Array;
  territoryStrength: Float32Array;
  windX: Float32Array;
  windY: Float32Array;
  weatherPatterns: Float32Array;
  populationPressure: Float32Array;

  constructor(w: number, h: number, config: WorldConfig) {
    this.width = w;
    this.height = h;
    this.config = config;
    const total = w * h;
    this.territoryOwner = new Int32Array(total);
    this.territoryStrength = new Float32Array(total);
    this.windX = new Float32Array(total);
    this.windY = new Float32Array(total);
    this.weatherPatterns = new Float32Array(total);
    this.populationPressure = new Float32Array(total);
  }

  isValid(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  tileAt(x: number, y: number): Tile {
    return this.tiles[y * this.width + x];
  }

  tileIndex(x: number, y: number): number {
    return y * this.width + x;
  }

  isPassable(x: number, y: number): boolean {
    if (!this.isValid(x, y)) return false;
    const tile = this.tileAt(x, y);
    return tile.terrain !== Terrain.DeepWater;
  }

  claimTerritory(x: number, y: number, species: number): void {
    const idx = y * this.width + x;
    if (idx < 0 || idx >= this.territoryOwner.length) return;
    this.territoryOwner[idx] = species;
    this.territoryStrength[idx] = Math.min(1, this.territoryStrength[idx] + 0.02);
  }

  recordAgentPresence(_x: number, _y: number): void { /* no-op for WASM */ }
  updateEnvironment(_tick: number): void { /* handled by WASM */ }

  /** Refresh tile data from the WASM packed buffer. */
  refreshTiles(wasm: WasmModule): void {
    const total = this.width * this.height;
    const ptr = wasm.getTileDataPtr();
    if (!ptr) return; // WASM not ready yet
    const off = ptr / 4;
    const heap = wasm.HEAPF32;

    if (this.tiles.length !== total) {
      this.tiles = new Array(total);
      for (let i = 0; i < total; i++) {
        this.tiles[i] = {
          terrain: Terrain.Grass, elevation: 0.5, temperature: 20,
          humidity: 0.5, foodResource: 50, waterResource: 30, energy: 30,
          hazard: 0, fertility: 0.5, pheromone: 0,
        };
      }
    }

    for (let i = 0; i < total; i++) {
      const b = off + i * 5;
      const t = this.tiles[i];
      t.terrain     = Math.round(heap[b]) as Terrain;
      t.foodResource = heap[b + 1];
      t.waterResource = heap[b + 2];
      t.temperature  = heap[b + 3];
      t.hazard       = heap[b + 4];
      // Derive plausible elevation from terrain type for rendering
      if (t.terrain === Terrain.DeepWater) t.elevation = 0.15;
      else if (t.terrain === Terrain.ShallowWater) t.elevation = 0.3;
      else if (t.terrain === Terrain.Sand) t.elevation = 0.4;
      else if (t.terrain === Terrain.Grass) t.elevation = 0.5;
      else if (t.terrain === Terrain.Forest) t.elevation = 0.55;
      else if (t.terrain === Terrain.Mountain) t.elevation = 0.8;
      else if (t.terrain === Terrain.Snow) t.elevation = 0.9;
    }
  }
}

/* ──────────────────── Species Registry Proxy ──────────────────── */

class WasmSpeciesRegistryProxy {
  species: Map<number, SpeciesInfo> = new Map();

  refresh(wasm: WasmModule): void {
    const rawList: any[] = wasm.getSpeciesInfo();
    this.species.clear();
    for (const raw of rawList) {
      const id: number = raw.id;
      const isFirst = id === 1;
      this.species.set(id, {
        id,
        name: isFirst ? 'Homo Sapiens' :
              (SPECIES_NAMES[(id - 1) % SPECIES_NAMES.length] +
              (id > SPECIES_NAMES.length ? ` ${Math.ceil(id / SPECIES_NAMES.length)}` : '')),
        color: isFirst ? '#FFD700' : SPECIES_COLORS[(id - 1) % SPECIES_COLORS.length],
        originTick: raw.originTick ?? 0,
        founderTraits: {} as Traits,
        population: raw.population ?? 0,
        totalEverLived: raw.totalEverLived ?? 0,
        extinct: !!raw.extinct,
        extinctTick: raw.extinctTick ?? null,
      });
    }
  }

  getAliveSpecies(): SpeciesInfo[] {
    return Array.from(this.species.values()).filter(s => !s.extinct);
  }

  updatePopulation(): void { /* no-op: WASM handles counts */ }
  markExtinct(): void { /* no-op */ }
  registerSpecies(): SpeciesInfo { return {} as SpeciesInfo; }
}

/* ──────────────────── Agent Reconstruction ──────────────────── */

function buildAgentsFromPacked(wasm: WasmModule): Agent[] {
  const count = wasm.getAgentCount();
  if (count === 0) return [];
  const ptr = wasm.getAgentDataPtr();
  const off = ptr / 4;
  const heap = wasm.HEAPF32;
  const agents: Agent[] = new Array(count);

  for (let i = 0; i < count; i++) {
    const b = off + i * 7;
    agents[i] = {
      id: i,
      x: heap[b], y: heap[b + 1], species: heap[b + 2],
      energy: heap[b + 3], health: heap[b + 4],
      maxHealth: 100, age: 0, maxAge: 300, generation: 0,
      genome: { brainWeights: new Float32Array(0), traits: {} as Traits },
      psychology: { fear: 0, aggression: 0, curiosity: 0, socialBonding: 0,
                    hunger: 0, thirst: 0, fatigue: 0, loneliness: 0, satisfaction: 0 },
      memory: [],
      alive: heap[b + 5] > 0.5,
      lastAction: heap[b + 6] as AgentAction,
      kills: 0, offspring: 0, foodEaten: 0, tickBorn: 0,
      parentId: null, gestationCooldown: 0, morale: 0.5,
      alliances: [], shelterX: -1, shelterY: -1,
      venomStack: 0, isBurrowed: false,
      migrationTarget: null, communicationCooldown: 0,
      totalDistanceTraveled: 0,
    };
  }
  return agents;
}

function buildAgentDetail(wasm: WasmModule, agentId: number): Agent | null {
  const d = wasm.getAgentDetail(agentId);
  if (!d) return null;

  const traits: Traits = {
    speed: d[17], size: d[18], perceptionRadius: d[19],
    metabolism: d[20], reproductionThreshold: d[21], mutationRate: d[22],
    aggressionBias: d[23], socialBias: d[24], heatTolerance: d[25],
    foodEfficiency: d[26], nocturnal: d[27], camouflage: d[28],
    packHunting: d[29], toolUse: d[30], singing: d[31],
    burrowing: d[32], venom: d[33], regeneration: d[34],
    flight: d[35], aquatic: d[36], migrationDrive: d[37],
    longevity: d[38], immuneStrength: d[39], learningRate: d[40],
  };
  const psychology: Psychology = {
    hunger: d[41], thirst: d[42], fatigue: d[43],
    fear: d[44], aggression: d[45], curiosity: d[46],
    socialBonding: d[47], loneliness: d[48], satisfaction: d[49],
  };

  return {
    id: d[0], x: d[1], y: d[2], species: d[3],
    energy: d[4], health: d[5], maxHealth: d[6],
    age: d[7], maxAge: d[8], generation: d[9],
    kills: d[10], offspring: d[11], foodEaten: d[12],
    lastAction: d[13] as AgentAction, morale: d[14],
    alliances: [],
    genome: { brainWeights: new Float32Array(0), traits },
    psychology, memory: [], alive: true, tickBorn: 0,
    parentId: null, gestationCooldown: 0,
    shelterX: -1, shelterY: -1, venomStack: 0,
    isBurrowed: false, migrationTarget: null,
    communicationCooldown: 0, totalDistanceTraveled: d[16],
  };
}

/* ──────────────────── WasmSimulation ──────────────────── */

/**
 * Drop-in replacement for the TS `Simulation` class.
 * Every instance it produces satisfies the `SimulationInstance` shape
 * so all existing UI components render without modification.
 */
export class WasmSimulation {
  private wasm: WasmModule | null = null;
  private _ready = false;

  instances: Map<string, SimulationInstance> = new Map();
  activeInstanceId: string | null = null;
  speed: number = 1;
  baseTickRate: number = 4;
  private _tickAccumulator: number = 0;
  private _lastStepTime: number = 0;
  onStatsUpdate?: (instanceId: string, stats: WorldStats) => void;
  onAgentBirth?: (instanceId: string, agent: Agent) => void;
  onAgentDeath?: (instanceId: string, agent: Agent) => void;

  async init(): Promise<void> {
    this.wasm = await loadWasm();
    this._ready = true;
  }

  get ready(): boolean { return this._ready; }

  /* ─── Instance Management ─── */

  createInstance(name: string, config: Partial<WorldConfig> = {}): SimulationInstance {
    if (!this.wasm) throw new Error('WASM not loaded — call init() first');
    const fullConfig = { ...DEFAULT_WORLD_CONFIG, ...config };
    const id = `wasm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    this.wasm.createSimulation(
      fullConfig.width, fullConfig.height,
      fullConfig.initialAgents, fullConfig.initialSpecies,
      fullConfig.seed,
    );

    const world = new WasmWorldProxy(fullConfig.width, fullConfig.height, fullConfig) as any;
    world.refreshTiles(this.wasm);

    const speciesRegistry = new WasmSpeciesRegistryProxy() as any;
    speciesRegistry.refresh(this.wasm);

    const instance: SimulationInstance = {
      id, name,
      world,
      agents: buildAgentsFromPacked(this.wasm),
      grid: { firstAt: () => -1, next: () => -1, rebuild: () => {} } as any,
      speciesRegistry,
      tick: 0,
      state: SimulationState.Paused,
      stats: this._getStats(0),
      statsHistory: [],
      pendingInterventions: [],
      processOffset: 0,
      extendedOffset: 0,
      eventLog: new EventLog(),
      civilization: new CivilizationSystem(),
      lastSeason: 0,
      lastPopMilestone: 0,
      statsHistoryIdx: 0,
    };

    this.instances.set(id, instance);
    if (!this.activeInstanceId) this.activeInstanceId = id;
    return instance;
  }

  removeInstance(id: string): void {
    if (!this.wasm) return;
    this.instances.delete(id);
    if (this.activeInstanceId === id) {
      this.activeInstanceId = this.instances.size > 0
        ? this.instances.keys().next().value ?? null : null;
    }
    this.wasm.destroySimulation();
  }

  cloneInstance(_sourceId: string, _newName: string): SimulationInstance | null {
    // WASM engine currently supports a single simulation context.
    // Clone is not supported; return null.
    return null;
  }

  getActive(): SimulationInstance | null {
    return this.activeInstanceId
      ? this.instances.get(this.activeInstanceId) ?? null
      : null;
  }

  /* ─── Tick / Step ─── */

  tick(instance?: SimulationInstance): void {
    if (!this.wasm) return;
    const inst = instance ?? this.getActive();
    if (!inst || inst.state !== SimulationState.Running) return;

    this.wasm.tickSimulation(1);
    this._refreshInstance(inst);
  }

  step(): void {
    if (!this.wasm) return;
    const now = performance.now();
    const dt = this._lastStepTime > 0 ? Math.min(now - this._lastStepTime, 200) : 16;
    this._lastStepTime = now;

    const ticksPerSec = this.baseTickRate * this.speed;
    this._tickAccumulator += (dt / 1000) * ticksPerSec;
    if (this._tickAccumulator < 1) return;

    const deadline = now + 14;
    const budget = Math.floor(this._tickAccumulator);
    let ran = 0;

    for (const inst of this.instances.values()) {
      if (inst.state !== SimulationState.Running) continue;
      for (let i = 0; i < budget; i++) {
        if (performance.now() >= deadline) break;
        this.wasm!.tickSimulation(1);
        ran++;
      }
      this._refreshInstance(inst);
    }

    this._tickAccumulator -= ran;
    if (this._tickAccumulator > 20) this._tickAccumulator = 20;
  }

  /* ─── Interventions ─── */

  applyIntervention(_instanceId: string, intervention: Intervention): void {
    if (!this.wasm) return;
    const typeInt = INTERVENTION_TYPE_MAP[intervention.type] ?? 0;
    const p = intervention.params;
    this.wasm.applyIntervention(
      typeInt,
      (p.amount as number) ?? 0,
      (p.multiplier as number) ?? 1,
      (p.speciesId as number) ?? 0,
      (p.count as number) ?? 10,
      (p.x as number) ?? 0,
      (p.y as number) ?? 0,
      (p.radius as number) ?? 10,
      (p.intensity as number) ?? 0.5,
      CLIMATE_EVENT_MAP[(p.eventType as string) ?? ''] ?? 0,
    );
  }

  /* ─── Internal helpers ─── */

  /** Pull latest data from WASM into the JS-side instance. */
  private _refreshInstance(inst: SimulationInstance): void {
    if (!this.wasm) return;
    const tick = this.wasm.getTick();
    inst.tick = tick;
    inst.agents = buildAgentsFromPacked(this.wasm);

    // Refresh world tiles & species every 5 ticks to keep overhead low
    if (tick % 5 === 0) {
      (inst.world as any).refreshTiles(this.wasm);
      (inst.speciesRegistry as any).refresh(this.wasm);
      inst.stats = this._getStats(tick);
      if (inst.statsHistory.length < 4000) {
        inst.statsHistory.push(inst.stats);
      } else {
        inst.statsHistory[inst.statsHistoryIdx % 4000] = inst.stats;
      }
      inst.statsHistoryIdx++;
      this.onStatsUpdate?.(inst.id, inst.stats);
    }
  }

  /** Get full agent detail from WASM. */
  getAgentDetail(agentId: number): Agent | null {
    if (!this.wasm) return null;
    return buildAgentDetail(this.wasm, agentId);
  }

  private _getStats(tick: number): WorldStats {
    if (!this.wasm) return {
      tick: 0, year: 0, totalAgents: 0, totalSpecies: 0,
      averageEnergy: 0, averageAge: 0, totalBirths: 0, totalDeaths: 0,
      averageTemperature: 0, totalFood: 0, extinctions: 0,
      speciesPopulations: new Map(),
    };

    const raw = this.wasm.getStats();
    const pops = new Map<number, number>();
    if (raw.speciesPopulations) {
      const obj = raw.speciesPopulations;
      for (const key of Object.keys(obj)) {
        pops.set(Number(key), obj[key]);
      }
    }

    return {
      tick: raw.tick ?? tick,
      year: raw.year ?? 0,
      totalAgents: raw.totalAgents ?? 0,
      totalSpecies: raw.totalSpecies ?? 0,
      averageEnergy: raw.averageEnergy ?? 0,
      averageAge: raw.averageAge ?? 0,
      totalBirths: raw.totalBirths ?? 0,
      totalDeaths: raw.totalDeaths ?? 0,
      averageTemperature: raw.averageTemperature ?? 0,
      totalFood: raw.totalFood ?? 0,
      extinctions: raw.extinctions ?? 0,
      speciesPopulations: pops,
    };
  }
}
