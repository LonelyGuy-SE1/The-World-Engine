export * from './types';
export { NeuralNet } from './NeuralNet';
export { World } from './World';
export { SpatialGrid } from './SpatialGrid';
export {
  SpeciesRegistry,
  createAgent,
  createRandomAgent,
  randomTraits,
  mutateTraits,
  decideAction,
  executeAction,
  updateAgentLifecycle,
  applyTemperatureStress,
  buildInputVector,
  addToGrid,
  removeFromGrid,
  rebuildGrid,
  BRAIN_CONFIG,
  resetAgentIds,
} from './Agent';
export { Simulation } from './Simulation';
export type { SimulationInstance } from './Simulation';
export { WasmSimulation, isWasmAvailable } from './WasmSimulation';
export { EventLog, EventType } from './EventLog';
export type { WorldEvent } from './EventLog';
export { CivilizationSystem, TECH_TREE } from './Civilization';
export type { Technology, SpeciesCivilization } from './Civilization';
export { AIIntegration, createRLEnvironment } from './AIIntegration';
export type { LLMConfig, GeneratedSpecies, RLEnvironment } from './AIIntegration';
export { PluginManager } from './PluginSystem';
export type { Plugin, PluginContext } from './PluginSystem';
export { VolcanicActivityPlugin, SeasonalMigrationPlugin, SymbiosisPlugin } from './PluginSystem';
