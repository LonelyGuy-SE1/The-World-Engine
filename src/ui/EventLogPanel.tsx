import React, { useState } from "react";
import { SimulationInstance } from "../engine/Simulation";
import { WorldEvent, EventType } from "../engine/EventLog";
import {
  SkullIcon,
  LightbulbIcon,
  CastleIcon,
  SwordsIcon,
  ClimateIcon,
  WarningIcon,
  SeedlingIcon,
  CycleIcon,
  TrendUpIcon,
  StarvationIcon,
  DisasterIcon,
  HammerIcon,
  DNAIcon,
} from "./Icons";

interface EventLogPanelProps {
  instance: SimulationInstance | null;
}

const EVENT_ICON_MAP: Record<
  string,
  React.FC<{ size?: number; color?: string }>
> = {
  extinction: SkullIcon,
  tech_discovery: LightbulbIcon,
  kingdom_formed: CastleIcon,
  war: SwordsIcon,
  population_milestone: TrendUpIcon,
  climate: ClimateIcon,
  resource_crisis: WarningIcon,
  new_species: SeedlingIcon,
  mass_starvation: StarvationIcon,
  season_change: CycleIcon,
  disaster: DisasterIcon,
  building_constructed: HammerIcon,
  invention: LightbulbIcon,
  cross_breed: DNAIcon,
};

const EVENT_COLORS: Record<string, string> = {
  extinction: "#F44336",
  tech_discovery: "#4CAF50",
  kingdom_formed: "#FFD700",
  war: "#FF5722",
  population_milestone: "#2196F3",
  climate: "#00BCD4",
  resource_crisis: "#FF9800",
  new_species: "#8BC34A",
  mass_starvation: "#E91E63",
  season_change: "#9E9E9E",
  disaster: "#D32F2F",
  building_constructed: "#795548",
  invention: "#AB47BC",
  cross_breed: "#00E676",
};

const FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All Events" },
  { value: "extinction", label: "Extinctions" },
  { value: "tech_discovery", label: "Discoveries" },
  { value: "kingdom_formed", label: "Kingdoms" },
  { value: "war", label: "Wars" },
  { value: "disaster", label: "Disasters" },
  { value: "building_constructed", label: "Buildings" },
  { value: "invention", label: "Inventions" },
  { value: "cross_breed", label: "Hybridization" },
  { value: "new_species", label: "New Species" },
];

export const EventLogPanel: React.FC<EventLogPanelProps> = ({ instance }) => {
  const [filter, setFilter] = useState("all");
  const [maxEvents, setMaxEvents] = useState(50);

  if (!instance) return null;

  const tpy = instance.world.config.ticksPerYear;
  const allEvents = instance.eventLog.getRecent(200);

  const filtered =
    filter === "all"
      ? allEvents.filter((e) => e.type !== "season_change")
      : allEvents.filter((e) => e.type === filter);

  const displayed = filtered.slice(-maxEvents).reverse();

  // Event type summary counts
  const typeCounts = new Map<string, number>();
  for (const e of allEvents) {
    typeCounts.set(e.type, (typeCounts.get(e.type) || 0) + 1);
  }

  return (
    <div className="panel event-log-panel">
      <h3>World Chronicle</h3>

      <div className="event-summary-bar">
        {Array.from(typeCounts.entries())
          .filter(([type]) => type !== "season_change")
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([type, count]) => (
            <span
              key={type}
              className="event-summary-chip"
              style={{ borderColor: EVENT_COLORS[type] || "#666" }}
              onClick={() => setFilter(type === filter ? "all" : type)}
              title={`${type.replace(/_/g, " ")}: ${count} events`}
            >
              {EVENT_ICON_MAP[type]
                ? React.createElement(EVENT_ICON_MAP[type], {
                    size: 10,
                    color: EVENT_COLORS[type],
                  })
                : null}
              <span className="event-summary-count">{count}</span>
            </span>
          ))}
      </div>

      <div className="event-filter-row">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="event-filter-select"
        >
          {FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <span className="event-count-label">
          {displayed.length} / {filtered.length} events
        </span>
      </div>

      <div className="event-log-list">
        {displayed.length === 0 ? (
          <p className="muted">No events matching filter.</p>
        ) : (
          displayed.map((event, i) => (
            <div
              key={i}
              className={`event-log-item event-${event.type}`}
              style={{ borderLeftColor: EVENT_COLORS[event.type] || "#444" }}
            >
              <div className="event-log-header">
                <span className="event-log-icon">
                  {EVENT_ICON_MAP[event.type]
                    ? React.createElement(EVENT_ICON_MAP[event.type], {
                        size: 14,
                        color: EVENT_COLORS[event.type],
                      })
                    : "\u2022"}
                </span>
                <span className="event-log-time">
                  Year {Math.floor(event.tick / tpy)}, Day {event.tick % tpy}
                </span>
                <span
                  className="event-log-type-badge"
                  style={{
                    backgroundColor:
                      (EVENT_COLORS[event.type] || "#444") + "22",
                    color: EVENT_COLORS[event.type] || "#888",
                  }}
                >
                  {event.type.replace(/_/g, " ")}
                </span>
              </div>
              <div className="event-log-message">{event.message}</div>
            </div>
          ))
        )}
      </div>

      {filtered.length > maxEvents && (
        <button
          className="btn btn-sm"
          onClick={() => setMaxEvents((m) => m + 50)}
          style={{ marginTop: "8px", width: "100%" }}
        >
          Show more ({filtered.length - maxEvents} remaining)
        </button>
      )}
    </div>
  );
};
