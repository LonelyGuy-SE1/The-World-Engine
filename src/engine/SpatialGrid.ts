import { Agent } from './types';

export class SpatialGrid {
  readonly width: number;
  readonly height: number;
  private cellHead: Int32Array;
  private nextLink: Int32Array;

  constructor(w: number, h: number, maxAgents: number = 10000) {
    this.width = w;
    this.height = h;
    this.cellHead = new Int32Array(w * h).fill(-1);
    this.nextLink = new Int32Array(maxAgents).fill(-1);
  }

  rebuild(agents: Agent[]): void {
    this.cellHead.fill(-1);
    const len = agents.length;
    if (len > this.nextLink.length) {
      this.nextLink = new Int32Array(Math.max(len * 2, 1024));
    }
    const w = this.width;
    for (let i = 0; i < len; i++) {
      const key = agents[i].y * w + agents[i].x;
      this.nextLink[i] = this.cellHead[key];
      this.cellHead[key] = i;
    }
  }

  firstAt(x: number, y: number): number {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return -1;
    return this.cellHead[y * this.width + x];
  }

  next(idx: number): number {
    return this.nextLink[idx];
  }
}
