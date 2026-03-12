# The World Engine (Outdated Readme)

An artificial life simulation where thousands of neural-network-driven agents survive, reproduce, form civilizations, discover technology, and wage wars — all emergent from simple rules.

## Features

### Agents & AI

- Each agent has a 40→20→10 neural network brain making real-time decisions
- 10 possible actions: move (N/S/E/W), stay, eat, drink, reproduce, attack, rest
- Psychology system: fear, aggression, curiosity, social bonding, hunger, thirst, fatigue
- Memory system: agents remember locations of food, danger, mates, and social interactions
- Genetics: 10 heritable traits (speed, size, perception, metabolism, aggression, social bias, heat tolerance, food efficiency, reproduction threshold, mutation rate)
- Genome crossover and mutation during reproduction
- Gestation cooldown prevents unrealistic population explosions
- Species differentiation through trait drift over generations

### World

- Procedural terrain generation: deep water, shallow water, sand, grass, forest, mountain, snow
- Dynamic environment: temperature, humidity, food resources, water resources, hazards, fertility
- Seasonal cycle (spring/summer/autumn/winter) affecting temperature and resources
- Weather system with global temperature shifts
- Territory system: species claim and contest land
- Pheromone trails for social signaling

### Civilization

- 15-technology research tree unlocked through population milestones and age thresholds
- Kingdom formation with procedurally generated names
- Inter-species warfare triggered by territorial competition
- Tech discoveries: fire, tools, agriculture, writing, architecture, medicine, metallurgy, navigation, astronomy, philosophy, engineering, alchemy, gunpowder, printing, steam power
- Each technology provides tangible gameplay effects

### Rendering

- Canvas 2D renderer with ImageData tile caching for high performance
- Detailed creature sprites at high zoom (segmented insect-like bodies with eyes, legs, mandibles/antennae)
- Smooth zoom from world overview to individual agent inspection
- LOD system: dots at far zoom, circles at mid zoom, full sprites at close zoom
- Seasonal tint overlays
- Energy bars, action indicators, movement direction arrows
- Overlay modes: temperature, resources, hazards, grid, agent vision

### Dashboard & UI

- Real-time mini-charts: population, species count, avg energy, temperature, food, extinctions
- Species population chart over time
- Civilization panel showing kingdoms, tech trees, and wars
- Event log for extinction, tech discovery, kingdom formation, war, climate, etc.
- Agent inspector: full stats, psychology, genetics, memory, neural network weights
- NLP creature spawner: describe a creature in natural language to spawn it
- Multi-world parallel simulation support
- Placement tools: paint resources, hazards, or erase

### Performance

- Spatial hash grid for O(1) neighbor lookups
- ImageData-based tile rendering: ~3 canvas API calls instead of ~8000 per frame
- Adaptive batch processing: scales agent updates based on population size
- Accumulator-based tick system that prevents lost ticks under load
- Pre-allocated neural net layer buffers
- Shared input buffer across all agent brain evaluations

## Getting Started

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Build for production
npm run build
```

or visit https://theworldengine.vercel.app

## Controls

- **Play/Pause**: Start or stop the simulation
- **Speed**: 1x to 100x time multiplier
- **Zoom**: Mouse wheel to zoom in/out
- **Pan**: Click and drag to move the camera
- **Select**: Click an agent to inspect it
- **Placement tools**: Paint resources or hazards onto the map

## Screenshots
