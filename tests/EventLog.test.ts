import { describe, it, expect } from 'vitest';
import { EventLog, EventType } from '../src/engine/EventLog';

describe('EventLog', () => {
  it('logs events', () => {
    const log = new EventLog();
    log.log(0, EventType.Extinction, 'Species A went extinct');
    expect(log.events.length).toBe(1);
    expect(log.events[0].type).toBe(EventType.Extinction);
    expect(log.events[0].message).toBe('Species A went extinct');
  });

  it('respects maxEvents limit', () => {
    const log = new EventLog();
    log.maxEvents = 5;
    for (let i = 0; i < 10; i++) {
      log.log(i, EventType.SeasonChange, `Event ${i}`);
    }
    expect(log.events.length).toBe(5);
    expect(log.events[0].message).toBe('Event 5');
  });

  it('getRecent returns last N events', () => {
    const log = new EventLog();
    for (let i = 0; i < 10; i++) {
      log.log(i, EventType.SeasonChange, `Event ${i}`);
    }
    const recent = log.getRecent(3);
    expect(recent.length).toBe(3);
    expect(recent[0].message).toBe('Event 7');
    expect(recent[2].message).toBe('Event 9');
  });

  it('getByType filters correctly', () => {
    const log = new EventLog();
    log.log(0, EventType.Extinction, 'Extinct');
    log.log(1, EventType.SeasonChange, 'Season');
    log.log(2, EventType.Extinction, 'Extinct 2');
    
    const extinctions = log.getByType(EventType.Extinction);
    expect(extinctions.length).toBe(2);
  });

  it('stores optional data', () => {
    const log = new EventLog();
    log.log(0, EventType.Extinction, 'Test', { speciesId: 42 });
    expect(log.events[0].data).toEqual({ speciesId: 42 });
  });
});
