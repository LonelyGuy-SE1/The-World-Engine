export * from './types';
export { NeuralNet } from './NeuralNet';
export { World } from './World';
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
export { AIIntegration, createRLEnvironment } from './AIIntegration';
export type { LLMConfig, GeneratedSpecies, RLEnvironment } from './AIIntegration';
export { PluginManager } from './PluginSystem';
export type { Plugin, PluginContext } from './PluginSystem';
export { VolcanicActivityPlugin, SeasonalMigrationPlugin, SymbiosisPlugin } from './PluginSystem';
