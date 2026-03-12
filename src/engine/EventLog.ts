export enum EventType {
  Extinction = 'extinction',
  TechDiscovery = 'tech_discovery',
  KingdomFormed = 'kingdom_formed',
  War = 'war',
  PopulationMilestone = 'population_milestone',
  Climate = 'climate',
  ResourceCrisis = 'resource_crisis',
  NewSpecies = 'new_species',
  MassStarvation = 'mass_starvation',
  SeasonChange = 'season_change',
}

export interface WorldEvent {
  tick: number;
  type: EventType;
  message: string;
  data?: Record<string, unknown>;
}

export class EventLog {
  events: WorldEvent[] = [];
  maxEvents: number = 500;

  log(tick: number, type: EventType, message: string, data?: Record<string, unknown>): void {
    this.events.push({ tick, type, message, data });
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }
  }

  getRecent(count: number = 50): WorldEvent[] {
    return this.events.slice(-count);
  }

  getByType(type: EventType): WorldEvent[] {
    return this.events.filter(e => e.type === type);
  }
}
