import { NeuralNetConfig } from './types';

export class NeuralNet {
  readonly config: NeuralNetConfig;
  readonly weights: Float32Array;
  readonly totalWeights: number;

  private layerBuffers: Float32Array[];

  constructor(config: NeuralNetConfig, weights?: Float32Array) {
    this.config = config;
    this.totalWeights = NeuralNet.calcTotalWeights(config);

    if (weights) {
      if (weights.length !== this.totalWeights) {
        throw new Error(`Expected ${this.totalWeights} weights, got ${weights.length}`);
      }
      this.weights = weights;
    } else {
      this.weights = new Float32Array(this.totalWeights);
    }

    const sizes = [config.inputSize, ...config.hiddenSizes, config.outputSize];
    this.layerBuffers = sizes.map(s => new Float32Array(s));
  }

  static calcTotalWeights(config: NeuralNetConfig): number {
    const sizes = [config.inputSize, ...config.hiddenSizes, config.outputSize];
    let total = 0;
    for (let i = 0; i < sizes.length - 1; i++) {
      total += sizes[i] * sizes[i + 1] + sizes[i + 1]; // weights + biases
    }
    return total;
  }

  initializeRandom(rng: () => number): void {
    const sizes = [this.config.inputSize, ...this.config.hiddenSizes, this.config.outputSize];
    let offset = 0;
    for (let layer = 0; layer < sizes.length - 1; layer++) {
      const fanIn = sizes[layer];
      const fanOut = sizes[layer + 1];
      const scale = Math.sqrt(2.0 / (fanIn + fanOut));

      for (let i = 0; i < fanIn * fanOut; i++) {
        this.weights[offset++] = (rng() * 2 - 1) * scale;
      }
      for (let i = 0; i < fanOut; i++) {
        this.weights[offset++] = 0;
      }
    }
  }

  forward(input: Float32Array | number[]): Float32Array {
    const sizes = [this.config.inputSize, ...this.config.hiddenSizes, this.config.outputSize];

    const inputBuf = this.layerBuffers[0];
    for (let i = 0; i < this.config.inputSize; i++) {
      inputBuf[i] = input[i] ?? 0;
    }

    let weightOffset = 0;

    for (let layer = 0; layer < sizes.length - 1; layer++) {
      const inSize = sizes[layer];
      const outSize = sizes[layer + 1];
      const inBuf = this.layerBuffers[layer];
      const outBuf = this.layerBuffers[layer + 1];
      const isLastLayer = layer === sizes.length - 2;

      for (let j = 0; j < outSize; j++) {
        let sum = 0;
        for (let i = 0; i < inSize; i++) {
          sum += inBuf[i] * this.weights[weightOffset + j * inSize + i];
        }
        sum += this.weights[weightOffset + inSize * outSize + j];

        if (isLastLayer) {
          outBuf[j] = sum;
        } else {
          outBuf[j] = Math.tanh(sum);
        }
      }

      weightOffset += inSize * outSize + outSize;
    }

    const output = this.layerBuffers[this.layerBuffers.length - 1];
    softmax(output);

    return output;
  }

  mutate(mutationRate: number, mutationMagnitude: number, rng: () => number): NeuralNet {
    const newWeights = new Float32Array(this.weights);
    for (let i = 0; i < newWeights.length; i++) {
      if (rng() < mutationRate) {
        const u1 = rng();
        const u2 = rng();
        const gaussian = Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
        newWeights[i] += gaussian * mutationMagnitude;
        newWeights[i] = Math.max(-5, Math.min(5, newWeights[i]));
      }
    }
    return new NeuralNet(this.config, newWeights);
  }

  static crossover(parent1: NeuralNet, parent2: NeuralNet, rng: () => number): NeuralNet {
    const weights = new Float32Array(parent1.totalWeights);
    for (let i = 0; i < weights.length; i++) {
      const r = rng();
      if (r < 0.45) {
        weights[i] = parent1.weights[i];
      } else if (r < 0.9) {
        weights[i] = parent2.weights[i];
      } else {
        weights[i] = (parent1.weights[i] + parent2.weights[i]) / 2;
      }
    }
    return new NeuralNet(parent1.config, weights);
  }

  clone(): NeuralNet {
    return new NeuralNet(this.config, new Float32Array(this.weights));
  }

  serialize(): number[] {
    return Array.from(this.weights);
  }

  static deserialize(config: NeuralNetConfig, data: number[]): NeuralNet {
    return new NeuralNet(config, new Float32Array(data));
  }
}

function softmax(arr: Float32Array): void {
  let max = -Infinity;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] > max) max = arr[i];
  }
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    arr[i] = Math.exp(arr[i] - max);
    sum += arr[i];
  }
  if (sum > 0) {
    for (let i = 0; i < arr.length; i++) {
      arr[i] /= sum;
    }
  }
}
