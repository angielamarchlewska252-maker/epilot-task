export interface Clock {
  now(): number;
}

export const systemClock: Clock = {
  now: () => Date.now(),
};

export class ManualClock implements Clock {
  constructor(public current: number) {}

  now(): number {
    return this.current;
  }

  advance(ms: number): void {
    this.current += ms;
  }
}
