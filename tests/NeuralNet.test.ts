import { describe, it, expect } from 'vitest';
import { NeuralNet } from '../src/engine/NeuralNet';
import { NeuralNetConfig } from '../src/engine/types';

const SMALL_CONFIG: NeuralNetConfig = { inputSize: 4, hiddenSizes: [3], outputSize: 2 };
const BRAIN_CONFIG: NeuralNetConfig = { inputSize: 40, hiddenSizes: [20], outputSize: 10 };

describe('NeuralNet', () => {
  describe('calcTotalWeights', () => {
    it('calculates correct weight count for simple network', () => {
      // 4->3: 4*3 + 3 = 15 weights, 3->2: 3*2 + 2 = 8 weights => 23 total
      expect(NeuralNet.calcTotalWeights(SMALL_CONFIG)).toBe(23);
    });

    it('calculates correct weight count for brain config', () => {
      // 40->20: 40*20 + 20 = 820, 20->10: 20*10 + 10 = 210 => 1030
      expect(NeuralNet.calcTotalWeights(BRAIN_CONFIG)).toBe(1030);
    });
  });

  describe('constructor', () => {
    it('creates network with correct weight count', () => {
      const nn = new NeuralNet(SMALL_CONFIG);
      expect(nn.weights.length).toBe(23);
      expect(nn.totalWeights).toBe(23);
    });

    it('accepts pre-existing weights', () => {
      const weights = new Float32Array(23);
      weights[0] = 0.5;
      const nn = new NeuralNet(SMALL_CONFIG, weights);
      expect(nn.weights[0]).toBe(0.5);
    });

    it('throws on wrong weight count', () => {
      const weights = new Float32Array(10);
      expect(() => new NeuralNet(SMALL_CONFIG, weights)).toThrow('Expected 23 weights, got 10');
    });
  });

  describe('initializeRandom', () => {
    it('fills weights using provided RNG', () => {
      const nn = new NeuralNet(SMALL_CONFIG);
      expect(nn.weights.every(w => w === 0)).toBe(true);
      
      let seed = 42;
      nn.initializeRandom(() => {
        seed = (seed * 1664525 + 1013904223) & 0xffffffff;
        return (seed >>> 0) / 0xffffffff;
      });
      
      // Weights should now be non-zero
      const nonZero = Array.from(nn.weights).filter(w => w !== 0);
      expect(nonZero.length).toBeGreaterThan(0);
    });
  });

  describe('forward', () => {
    it('produces output of correct size', () => {
      const nn = new NeuralNet(SMALL_CONFIG);
      nn.initializeRandom(Math.random);
      const input = new Float32Array([1, 0, -1, 0.5]);
      const output = nn.forward(input);
      expect(output.length).toBe(2);
    });

    it('output is a probability distribution (softmax)', () => {
      const nn = new NeuralNet(SMALL_CONFIG);
      nn.initializeRandom(Math.random);
      const input = new Float32Array([1, 0, -1, 0.5]);
      const output = nn.forward(input);
      
      const sum = Array.from(output).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 3);
      output.forEach(v => {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      });
    });

    it('is deterministic for same weights and input', () => {
      const weights = new Float32Array(23);
      for (let i = 0; i < 23; i++) weights[i] = (i - 11) * 0.1;
      
      const nn1 = new NeuralNet(SMALL_CONFIG, new Float32Array(weights));
      const nn2 = new NeuralNet(SMALL_CONFIG, new Float32Array(weights));
      
      const input = new Float32Array([0.5, -0.3, 0.8, 0.1]);
      const out1 = nn1.forward(input);
      const out2 = nn2.forward(input);
      
      for (let i = 0; i < out1.length; i++) {
        expect(out1[i]).toBe(out2[i]);
      }
    });

    it('works with brain-sized config', () => {
      const nn = new NeuralNet(BRAIN_CONFIG);
      nn.initializeRandom(Math.random);
      const input = new Float32Array(40);
      for (let i = 0; i < 40; i++) input[i] = Math.random() * 2 - 1;
      
      const output = nn.forward(input);
      expect(output.length).toBe(10);
      
      const sum = Array.from(output).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 3);
    });
  });

  describe('mutate', () => {
    it('creates a new network with mutated weights', () => {
      const nn = new NeuralNet(SMALL_CONFIG);
      nn.initializeRandom(Math.random);
      
      const mutated = nn.mutate(1.0, 0.5, Math.random); // 100% mutation rate
      expect(mutated).not.toBe(nn);
      expect(mutated.weights.length).toBe(nn.weights.length);
      
      // With 100% mutation rate, weights should differ
      let diffCount = 0;
      for (let i = 0; i < nn.weights.length; i++) {
        if (nn.weights[i] !== mutated.weights[i]) diffCount++;
      }
      expect(diffCount).toBeGreaterThan(0);
    });

    it('preserves more weights with lower mutation rate', () => {
      const nn = new NeuralNet(SMALL_CONFIG);
      nn.initializeRandom(Math.random);
      
      const mutated = nn.mutate(0.0, 0.5, Math.random); // 0% mutation rate
      for (let i = 0; i < nn.weights.length; i++) {
        expect(mutated.weights[i]).toBe(nn.weights[i]);
      }
    });

    it('clamps weights to [-5, 5]', () => {
      const weights = new Float32Array(23).fill(4.9);
      const nn = new NeuralNet(SMALL_CONFIG, weights);
      const mutated = nn.mutate(1.0, 10.0, Math.random);
      
      mutated.weights.forEach(w => {
        expect(w).toBeGreaterThanOrEqual(-5);
        expect(w).toBeLessThanOrEqual(5);
      });
    });
  });

  describe('crossover', () => {
    it('produces child with weights from both parents', () => {
      const p1 = new NeuralNet(SMALL_CONFIG);
      const p2 = new NeuralNet(SMALL_CONFIG);
      p1.initializeRandom(() => 0.2);
      p2.initializeRandom(() => 0.8);
      
      const child = NeuralNet.crossover(p1, p2, Math.random);
      expect(child.weights.length).toBe(23);
      
      // Child should contain some weights from each parent
      let fromP1 = 0, fromP2 = 0;
      for (let i = 0; i < child.weights.length; i++) {
        if (child.weights[i] === p1.weights[i]) fromP1++;
        if (child.weights[i] === p2.weights[i]) fromP2++;
      }
      expect(fromP1 + fromP2).toBeGreaterThan(0);
    });
  });

  describe('clone', () => {
    it('creates independent copy', () => {
      const nn = new NeuralNet(SMALL_CONFIG);
      nn.initializeRandom(Math.random);
      const cloned = nn.clone();
      
      expect(cloned.weights.length).toBe(nn.weights.length);
      for (let i = 0; i < nn.weights.length; i++) {
        expect(cloned.weights[i]).toBe(nn.weights[i]);
      }
      
      // Modifying clone shouldn't affect original
      cloned.weights[0] = 999;
      expect(nn.weights[0]).not.toBe(999);
    });
  });
});
