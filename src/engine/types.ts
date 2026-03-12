export enum Terrain {
  DeepWater = 0,
  ShallowWater = 1,
  Sand = 2,
  Grass = 3,
  Forest = 4,
  Mountain = 5,
  Snow = 6,
}

export const TERRAIN_NAMES: Record<Terrain, string> = {
  [Terrain.DeepWater]: 'Deep Water',
  [Terrain.ShallowWater]: 'Shallow Water',
  [Terrain.Sand]: 'Sand',
  [Terrain.Grass]: 'Grass',
  [Terrain.Forest]: 'Forest',
  [Terrain.Mountain]: 'Mountain',
  [Terrain.Snow]: 'Snow',
};

export const TERRAIN_MOVEMENT_COST: Record<Terrain, number> = {
  [Terrain.DeepWater]: Infinity,
  [Terrain.ShallowWater]: 3.0,
  [Terrain.Sand]: 1.5,
  [Terrain.Grass]: 1.0,
  [Terrain.Forest]: 1.3,
  [Terrain.Mountain]: 4.0,
  [Terrain.Snow]: 2.0,
};

export const TERRAIN_COLORS: Record<Terrain, string> = {
  [Terrain.DeepWater]: '#0D47A1',
  [Terrain.ShallowWater]: '#1976D2',
  [Terrain.Sand]: '#FDD835',
  [Terrain.Grass]: '#4CAF50',
  [Terrain.Forest]: '#2E7D32',
  [Terrain.Mountain]: '#757575',
  [Terrain.Snow]: '#ECEFF1',
};

// --- Tile ---

export interface Tile {
  terrain: Terrain;
  elevation: number;       // 0–1
  temperature: number;     // -50 to 60°C
  humidity: number;        // 0–1
  foodResource: number;    // 0–100
  waterResource: number;   // 0–100
  energy: number;          // ambient energy
  hazard: number;          // 0–1 (toxicity, radiation, etc.)
  fertility: number;       // 0–1 (how fast food regrows)
  pheromone: number;       // 0–1 (social signal decay)
}

// --- Agent Psychology ---

export interface Psychology {
  fear: number;           // 0–1
  aggression: number;     // 0–1
  curiosity: number;      // 0–1
  socialBonding: number;  // 0–1
  hunger: number;         // 0–1
  thirst: number;         // 0–1
  fatigue: number;        // 0–1
}

// --- Genetics ---

export interface Traits {
  speed: number;              // movement efficiency (0.5–2.0)
  size: number;               // body size (0.5–2.0), affects energy needs and attack
  perceptionRadius: number;   // how far agent can see (1–8 tiles)
  metabolism: number;         // energy burn rate (0.5–2.0)
  reproductionThreshold: number; // energy needed to reproduce (0.3–0.9)
  mutationRate: number;       // offspring mutation magnitude (0.01–0.3)
  aggressionBias: number;     // innate aggression tendency (0–1)
  socialBias: number;         // innate cooperation tendency (0–1)
  heatTolerance: number;      // -1 to 1 (negative = cold-adapted, positive = heat-adapted)
  foodEfficiency: number;     // how well food is converted to energy (0.5–2.0)
}

export interface Genome {
  brainWeights: Float32Array;
  traits: Traits;
}

// --- Agent Memory ---

export interface MemoryEntry {
  tick: number;
  type: 'food' | 'danger' | 'mate' | 'death' | 'social';
  x: number;
  y: number;
  intensity: number;
}

// --- Agent ---

export enum AgentAction {
  MoveNorth = 0,
  MoveSouth = 1,
  MoveEast = 2,
  MoveWest = 3,
  Stay = 4,
  Eat = 5,
  Reproduce = 6,
  Attack = 7,
  Rest = 8,
  Drink = 9,
}

export const ACTION_COUNT = 10;

export interface Agent {
  id: number;
  x: number;
  y: number;
  energy: number;
  health: number;
  maxHealth: number;
  age: number;
  maxAge: number;
  generation: number;
  species: number;
  genome: Genome;
  psychology: Psychology;
  memory: MemoryEntry[];
  alive: boolean;
  lastAction: AgentAction;
  kills: number;
  offspring: number;
  foodEaten: number;
  tickBorn: number;
  parentId: number | null;
}

// --- Species Registry ---

export interface SpeciesInfo {
  id: number;
  name: string;
  color: string;
  originTick: number;
  founderTraits: Traits;
  population: number;
  totalEverLived: number;
  extinct: boolean;
  extinctTick: number | null;
}

// --- Neural Network Architecture ---

export interface NeuralNetConfig {
  inputSize: number;
  hiddenSizes: number[];
  outputSize: number;
}

// --- World Configuration ---

export interface WorldConfig {
  width: number;
  height: number;
  initialAgents: number;
  initialSpecies: number;
  baseTemperature: number;    // global base temperature
  temperatureVariance: number;
  resourceRegrowRate: number;
  weatherEnabled: boolean;
  mutationEnabled: boolean;
  maxAgents: number;
  ticksPerYear: number;       // how many ticks = 1 simulated year
  seed: number;
}

export const DEFAULT_WORLD_CONFIG: WorldConfig = {
  width: 256,
  height: 256,
  initialAgents: 300,
  initialSpecies: 6,
  baseTemperature: 15,
  temperatureVariance: 40,
  resourceRegrowRate: 0.03,
  weatherEnabled: true,
  mutationEnabled: true,
  maxAgents: 200000,
  ticksPerYear: 365,
  seed: Date.now(),
};

// --- World Statistics ---

export interface WorldStats {
  tick: number;
  year: number;
  totalAgents: number;
  totalSpecies: number;
  averageEnergy: number;
  averageAge: number;
  totalBirths: number;
  totalDeaths: number;
  averageTemperature: number;
  totalFood: number;
  extinctions: number;
  speciesPopulations: Map<number, number>;
}

// --- Experiment Types ---

export interface Experiment {
  id: string;
  name: string;
  description: string;
  worldIds: string[];
  interventions: Intervention[];
  startTick: number;
  snapshots: WorldSnapshot[];
}

export interface Intervention {
  type: InterventionType;
  worldId: string;
  tick: number;
  params: Record<string, number | string | boolean>;
}

export enum InterventionType {
  TemperatureShift = 'temperature_shift',
  ResourceMultiplier = 'resource_multiplier',
  IntroducePredator = 'introduce_predator',
  RemoveSpecies = 'remove_species',
  MutationRateChange = 'mutation_rate_change',
  AddHazard = 'add_hazard',
  SpawnCustomAgent = 'spawn_custom_agent',
  ClimateEvent = 'climate_event',
}

export interface WorldSnapshot {
  tick: number;
  stats: WorldStats;
  config: WorldConfig;
}

// --- Simulation State ---

export enum SimulationState {
  Stopped = 'stopped',
  Running = 'running',
  Paused = 'paused',
}

// --- PRNG ---

export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  next(): number {
    this.state = (this.state * 1664525 + 1013904223) & 0xffffffff;
    return (this.state >>> 0) / 0xffffffff;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  nextFloat(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  nextGaussian(): number {
    const u1 = this.next();
    const u2 = this.next();
    return Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
  }

  getSeed(): number {
    return this.state;
  }
}
