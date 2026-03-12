import { Simulation } from './src/engine/Simulation';
import { SimulationState } from './src/engine/types';

async function runPerfTest() {
  console.log('=== Detailed Performance Profile ===\n');

  const sim = new Simulation();

  const inst = sim.createInstance('Profile100K', {
    width: 512,
    height: 512,
    initialAgents: 100000,
    initialSpecies: 15,
    maxAgents: 200000,
  });
  inst.state = SimulationState.Running;
  console.log(`Created: ${inst.agents.length} agents on 512x512`);

  // Warmup
  for (let i = 0; i < 3; i++) sim.tick(inst);
  console.log(`Warmup done. Agents: ${inst.agents.length}`);

  // Profile 10 ticks
  const times: number[] = [];
  for (let i = 0; i < 10; i++) {
    const t0 = performance.now();
    sim.tick(inst);
    const elapsed = performance.now() - t0;
    times.push(elapsed);
    console.log(`  Tick ${inst.tick}: ${elapsed.toFixed(1)}ms (agents: ${inst.agents.length})`);
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(`\n  Average: ${avg.toFixed(1)}ms`);
  console.log(`  Target for 30fps: 33ms`);
  console.log(`  Target for 60fps: 16ms`);

  // Now profile individual phases
  console.log('\n--- Phase Breakdown ---');

  const { world, agents, grid, speciesRegistry } = inst;

  let t0 = performance.now();
  grid.rebuild(agents);
  console.log(`  Grid rebuild (${agents.length} agents): ${(performance.now() - t0).toFixed(2)}ms`);

  t0 = performance.now();
  world.updateEnvironment(inst.tick);
  console.log(`  Environment update (${512*512} tiles): ${(performance.now() - t0).toFixed(2)}ms`);

  t0 = performance.now();
  let agentCount = agents.length;
  for (let i = 0; i < agentCount; i++) {
    const a = agents[i];
    a.age++;
    const t = a.genome.traits;
    a.energy -= 0.15 * t.metabolism * (0.5 + t.size * 0.5);
    if (a.energy <= 0) { a.health -= 5; a.energy = 0; }
  }
  console.log(`  Minimal lifecycle (${agentCount} agents): ${(performance.now() - t0).toFixed(2)}ms`);

  // Profile neural net batch
  const { decideAction, executeAction, buildInputVector } = await import('./src/engine/Agent');
  const nearbyBuf: any[] = [];
  t0 = performance.now();
  let processed = 0;
  for (let b = 0; b < 1500; b++) {
    const agent = agents[b % agents.length];
    if (!agent.alive) continue;
    nearbyBuf.length = 0;
    const pr = 3;
    for (let dy = -pr; dy <= pr; dy++) {
      const ny = agent.y + dy;
      if (ny < 0 || ny >= world.height) continue;
      for (let dx = -pr; dx <= pr; dx++) {
        const nx = agent.x + dx;
        if (nx < 0 || nx >= world.width) continue;
        let gIdx = grid.firstAt(nx, ny);
        while (gIdx >= 0) {
          const a = agents[gIdx];
          if (a.alive && a.id !== agent.id) nearbyBuf.push(a);
          gIdx = grid.next(gIdx);
          if (nearbyBuf.length >= 20) break;
        }
        if (nearbyBuf.length >= 20) break;
      }
      if (nearbyBuf.length >= 20) break;
    }
    const action = decideAction(agent, world, nearbyBuf);
    executeAction(agent, action, world, agents, grid);
    processed++;
  }
  console.log(`  AI batch (${processed} agents): ${(performance.now() - t0).toFixed(2)}ms`);

  console.log(`\n  Total agents: ${agents.length}`);
}

runPerfTest();
