import { Simulation } from './src/engine/Simulation';
import { SimulationState } from './src/engine/types';

async function runPerfTest() {
  console.log('=== World Engine Performance Test ===\n');

  const sim = new Simulation();

  // Test 1: Large world with scaling agent counts
  const testConfigs = [
    { name: '5K agents (256x256)', agents: 5000, species: 8, w: 256, h: 256 },
    { name: '20K agents (256x256)', agents: 20000, species: 10, w: 256, h: 256 },
    { name: '50K agents (512x512)', agents: 50000, species: 12, w: 512, h: 512 },
    { name: '100K agents (512x512)', agents: 100000, species: 15, w: 512, h: 512 },
  ];

  for (const tc of testConfigs) {
    console.log(`\n--- ${tc.name} ---`);

    const inst = sim.createInstance(tc.name, {
      width: tc.w,
      height: tc.h,
      initialAgents: tc.agents,
      initialSpecies: tc.species,
      maxAgents: 200000,
    });
    inst.state = SimulationState.Running;

    console.log(`Created: ${inst.agents.length} agents`);

    // Run 20 ticks and measure
    const times: number[] = [];
    for (let i = 0; i < 20; i++) {
      const t0 = performance.now();
      sim.tick(inst);
      const elapsed = performance.now() - t0;
      times.push(elapsed);
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const max = Math.max(...times);
    const min = Math.min(...times);

    console.log(`  Avg tick: ${avg.toFixed(2)}ms`);
    console.log(`  Min tick: ${min.toFixed(2)}ms`);
    console.log(`  Max tick: ${max.toFixed(2)}ms`);
    console.log(`  Agents after 20 ticks: ${inst.agents.length}`);
    console.log(`  FPS equivalent (at 1 tick/frame): ${(1000 / avg).toFixed(1)}`);

    sim.removeInstance(inst.id);
  }

  console.log('\n=== Test Complete ===');
}

runPerfTest();
