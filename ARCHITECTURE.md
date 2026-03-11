# The World Engine — Architecture Documentation

## Overview

The World Engine is a research-grade artificial life simulation platform that models persistent 2D tile-based worlds containing autonomous agents, dynamic ecosystems, and emergent evolutionary behaviors. It supports multiple independent simulation worlds, controlled experiments, and extensible mechanics through a plugin system.

## System Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    React UI Layer                         │
│  ┌──────────┬───────────┬────────────┬─────────────────┐ │
│  │  World   │  Control  │ Experiment │    Dashboard     │ │
│  │  Viewer  │  Panel    │   Panel    │     Panel        │ │
│  │(Canvas2D)│           │            │  (Mini Charts)   │ │
│  └────┬─────┴─────┬─────┴──────┬─────┴────────┬────────┘ │
│       │           │            │              │           │
│  ┌────┴───────────┴────────────┴──────────────┴────────┐ │
│  │              Canvas Renderer                         │ │
│  │  (Tile layer + Agent overlay + HUD + Overlays)      │ │
│  └────┬────────────────────────────────────────────────┘ │
│       │                                                   │
│  ┌────┴────────────────────────────────────────────────┐ │
│  │           Simulation Orchestrator                    │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │ │
│  │  │  World   │  │  Agent   │  │  Species          │  │ │
│  │  │  State   │  │  System  │  │  Registry         │  │ │
│  │  └────┬─────┘  └────┬─────┘  └────────┬─────────┘  │ │
│  │       │             │                  │             │ │
│  │  ┌────┴─────────────┴──────────────────┴─────────┐  │ │
│  │  │              Core Engine                       │  │ │
│  │  │  ┌──────────┐  ┌──────────┐  ┌─────────────┐  │  │ │
│  │  │  │  Neural  │  │ Genetics │  │ Environment  │  │  │ │
│  │  │  │   Net    │  │ & Traits │  │   Systems    │  │  │ │
│  │  │  └──────────┘  └──────────┘  └─────────────┘  │  │ │
│  │  └────────────────────────────────────────────────┘  │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌────────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Plugin System  │  │ AI Module    │  │  Web Worker  │  │
│  │                 │  │ (LLM + RL)   │  │  (Parallel)  │  │
│  └─────────────────┘  └──────────────┘  └──────────────┘  │
└──────────────────────────────────────────────────────────┘
```

## Module Descriptions

### Core Engine (`src/engine/`)

#### types.ts

All type definitions, enums, interfaces, and the seeded PRNG.

- `Terrain` enum (7 terrain types with movement costs and colors)
- `Tile` interface (environment attributes per grid cell)
- `Agent` interface (full agent state including genome, psychology, memory)
- `Genome` interface (neural network weights + phenotypic traits)
- `WorldConfig` and `DEFAULT_WORLD_CONFIG`
- `SeededRandom` class (deterministic PRNG for reproducible simulations)

#### NeuralNet.ts

Compact feedforward neural network for agent decision-making.

- Float32Array weights for memory efficiency
- tanh hidden activation, softmax output
- Xavier/Glorot initialization
- Mutation and crossover operations for evolutionary optimization
- Forward pass: ~1320 multiply-adds per agent per tick (39→28→16→9 architecture)

#### World.ts

World state management, terrain generation, and environmental processes.

- Multi-octave value noise terrain generation (elevation + moisture + temperature)
- Biome mapping from elevation/moisture/temperature to terrain types
- Environmental update loop: seasonal cycles, resource regrowth, weather patterns
- Spatial queries for nearby tiles within perception radius

#### Agent.ts

Agent lifecycle, genetics, decision-making, and interactions.

- Neural network input vector construction (39 dimensions)
- Action execution (9 possible actions: 4 movement + eat/reproduce/attack/rest/stay)
- Genetic crossover and mutation
- Species registry with population tracking
- Spatial grid for efficient nearby-agent queries

#### Simulation.ts

Main simulation orchestrator managing the complete tick loop.

- Multi-world instance management (create, clone, remove)
- Tick loop: environment → agent decisions → actions → lifecycle → cleanup
- Intervention system for experimental control
- Statistics computation and history tracking

### AI Integration (`src/engine/AIIntegration.ts`)

Modular AI integration supporting:

- **LLM Species Generation**: Generate species via OpenAI/Anthropic APIs
- **Algorithmic Fallback**: Built-in species archetypes (predator, herbivore, scavenger, etc.)
- **RL Environment**: OpenAI Gym-compatible interface for external RL training

### Plugin System (`src/engine/PluginSystem.ts`)

Extensibility framework with hooks for:

- Per-tick callbacks
- Agent birth/death events
- Environment update hooks
- Tile and agent modifiers
- Custom intervention types
- Species archetype registration

Included example plugins:

- `VolcanicActivityPlugin`: Periodic eruptions with hazard/temperature spikes
- `SeasonalMigrationPlugin`: Moving food scarcity waves
- `SymbiosisPlugin`: Inter-species cooperation bonuses

### Renderer (`src/renderer/CanvasRenderer.ts`)

High-performance Canvas2D renderer with:

- Viewport culling (only renders visible tiles)
- Agent rendering with species colors and energy indicators
- Multiple overlay modes: temperature, resources, hazards, grid
- Camera pan/zoom with smooth controls
- Agent selection visualization with perception radius
- HUD with simulation time and population

### UI Components (`src/ui/`)

- **WorldViewer**: Canvas integration with mouse pan/zoom/click
- **ControlPanel**: Play/pause, speed control, overlay toggles, live stats
- **InspectorPanel**: Detailed agent/tile inspection with stat bars and trait display
- **ExperimentPanel**: Intervention controls (temperature, resources, predators, hazards, climate events)
- **DashboardPanel**: Time-series charts for population, species, energy, temperature
- **WorldSelector**: Multi-world management with create/clone/remove

### Web Worker (`src/workers/simulation.worker.ts`)

Parallel simulation runner for multiple worlds:

- Runs complete simulation loop in worker thread
- Structured message protocol for state transfer
- Periodic stats and full state broadcasts
- Non-blocking tick loop using setTimeout

## Data Flow

```
User Input → UI Components → Simulation Orchestrator
                                    │
                          ┌─────────┼─────────┐
                          ↓         ↓         ↓
                    Environment   Agent     Cleanup
                      Update    Decisions   & Stats
                          │         │         │
                          └─────────┼─────────┘
                                    ↓
                              Canvas Renderer
                                    ↓
                              Visual Output
```

## Agent Decision Architecture

```
Agent Perception (39 inputs)
├── Self state: energy, health, age, hunger, fatigue, fear, aggression, curiosity, social (9)
├── Current tile: terrain one-hot, food, water, temp, hazard (11)
├── Surroundings: avg food, avg hazard, best food direction (3)
├── Nearest 3 agents: dx, dy, same_species, relative_energy (12)
└── Memory summary: food_dir_x/y, danger_dir_x/y (4)
    │
    ↓
Neural Network (39 → 28 → 16 → 9)
├── Hidden 1: 28 neurons, tanh activation
├── Hidden 2: 16 neurons, tanh activation
└── Output: 9 neurons, softmax
    │
    ↓
Action Selection (probabilistic sampling)
├── Move N/S/E/W (4 directions)
├── Stay (idle)
├── Eat (consume tile resources)
├── Reproduce (sexual/asexual with genetic inheritance)
├── Attack (damage nearby agent)
└── Rest (recover energy/health)
```

## Evolutionary Dynamics

### Genome Structure

- **Brain weights**: ~1350 Float32 values encoding the neural network
- **Phenotypic traits**: 10 continuous values (speed, size, perception, metabolism, etc.)

### Reproduction

- Sexual (with nearby mate of same species) or asexual
- Crossover: Uniform crossover with 10% weight averaging
- Mutation: Gaussian noise applied per-weight with configurable rate
- Trait inheritance: random parent selection per trait + mutation

### Selection Pressure

- Energy management (metabolism vs. food efficiency)
- Predation (size/aggression vs. speed/perception tradeoffs)
- Environmental adaptation (heat tolerance, terrain traversal)
- Social cooperationattempts (social bias, bonding mechanics)

## Performance Characteristics

| Metric                     | Value                          |
| -------------------------- | ------------------------------ |
| Neural net forward pass    | ~1320 multiply-adds per agent  |
| Max agents supported       | 5000 per world                 |
| Tile grid size             | Up to 512×512                  |
| Stats update frequency     | Every 10 ticks                 |
| History snapshot frequency | Every 100 ticks                |
| Renderer                   | Canvas2D with viewport culling |
| Parallel worlds            | Via Web Worker instances       |

## Experiment System

### Available Interventions

1. **Temperature Shift**: Global temperature offset (±°C)
2. **Resource Multiplier**: Scale all food/fertility
3. **Introduce Predator**: Spawn aggressive species
4. **Remove Species**: Instantly kill all agents of a species
5. **Mutation Rate Change**: Scale mutation rates globally
6. **Add Hazard Zone**: Create toxic area at coordinates
7. **Climate Event**: Ice Age / Heat Wave / Great Flood

### Experimental Workflow

1. Create baseline world ("World A")
2. Clone to "World B"
3. Apply intervention to World B
4. Run both worlds in parallel
5. Compare stats via dashboard

## Technology Stack

| Component      | Technology          | Rationale                                               |
| -------------- | ------------------- | ------------------------------------------------------- |
| Framework      | React 18            | Component-based UI, wide ecosystem                      |
| Language       | TypeScript          | Type safety for complex simulation types                |
| Build          | Vite 6              | Fast dev server, ES module support, worker bundling     |
| Rendering      | Canvas 2D           | Lightweight, no dependencies, sufficient for tile-based |
| NN Engine      | Custom Float32Array | Minimal overhead, no library dependency                 |
| PRNG           | Custom LCG          | Deterministic, seedable for reproducibility             |
| Parallelism    | Web Workers         | Non-blocking multi-world simulation                     |
| AI Integration | Fetch API           | Provider-agnostic LLM integration                       |

## File Structure

```
src/
├── main.tsx                          # React entry point
├── App.tsx                           # Main application component
├── App.css                           # Application styles
├── engine/
│   ├── index.ts                      # Barrel exports
│   ├── types.ts                      # Type definitions and PRNG
│   ├── NeuralNet.ts                  # Neural network implementation
│   ├── World.ts                      # World state and terrain generation
│   ├── Agent.ts                      # Agent system and genetics
│   ├── Simulation.ts                 # Simulation orchestrator
│   ├── AIIntegration.ts              # LLM and RL integration
│   └── PluginSystem.ts              # Plugin/extensibility framework
├── renderer/
│   └── CanvasRenderer.ts             # Canvas 2D renderer
├── ui/
│   ├── WorldViewer.tsx               # Canvas world viewer
│   ├── ControlPanel.tsx              # Simulation controls
│   ├── InspectorPanel.tsx            # Agent/tile inspector
│   ├── ExperimentPanel.tsx           # Experiment controls
│   ├── DashboardPanel.tsx            # Statistics dashboard
│   └── WorldSelector.tsx             # Multi-world management
└── workers/
    └── simulation.worker.ts          # Web Worker simulation runner
```
