import React from "react";
import { Agent, Tile, AgentAction, TERRAIN_NAMES } from "../engine/types";
import { SpeciesRegistry } from "../engine/Agent";
import { World } from "../engine/World";

interface InspectorPanelProps {
  selectedAgent: Agent | null;
  selectedTile: { x: number; y: number } | null;
  world: World | null;
  speciesRegistry: SpeciesRegistry | null;
}

const ACTION_NAMES: Record<AgentAction, string> = {
  [AgentAction.MoveNorth]: "Move North",
  [AgentAction.MoveSouth]: "Move South",
  [AgentAction.MoveEast]: "Move East",
  [AgentAction.MoveWest]: "Move West",
  [AgentAction.Stay]: "Stay",
  [AgentAction.Eat]: "Eat",
  [AgentAction.Reproduce]: "Reproduce",
  [AgentAction.Attack]: "Attack",
  [AgentAction.Rest]: "Rest",
  [AgentAction.Drink]: "Drink",
};

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  selectedAgent,
  selectedTile,
  world,
  speciesRegistry,
}) => {
  return (
    <div className="panel inspector-panel">
      <h3>Inspector</h3>

      {selectedAgent ? (
        <AgentInspector
          agent={selectedAgent}
          speciesRegistry={speciesRegistry}
        />
      ) : selectedTile && world ? (
        <TileInspector x={selectedTile.x} y={selectedTile.y} world={world} />
      ) : (
        <p className="muted">Click on an agent or tile to inspect it.</p>
      )}
    </div>
  );
};

const AgentInspector: React.FC<{
  agent: Agent;
  speciesRegistry: SpeciesRegistry | null;
}> = ({ agent, speciesRegistry }) => {
  const sp = speciesRegistry?.species.get(agent.species);
  const traits = agent.genome.traits;
  const psy = agent.psychology;

  return (
    <div className="inspector-content">
      <div className="inspector-header">
        <span
          className="species-dot"
          style={{ backgroundColor: sp?.color || "#fff" }}
        />
        <span>
          {sp?.name || "Unknown"} #{agent.id}
        </span>
        <span className={`status ${agent.alive ? "alive" : "dead"}`}>
          {agent.alive ? "Alive" : "Dead"}
        </span>
      </div>

      <div className="inspector-section">
        <h4>Vitals</h4>
        <div className="stat-grid compact">
          <StatBar
            label="Energy"
            value={agent.energy}
            max={100}
            color="#4CAF50"
          />
          <StatBar
            label="Health"
            value={agent.health}
            max={agent.maxHealth}
            color="#F44336"
          />
          <StatBar
            label="Age"
            value={agent.age}
            max={agent.maxAge}
            color="#2196F3"
          />
        </div>
        <div className="stat-row">
          <span>
            Position: ({agent.x}, {agent.y})
          </span>
          <span>Gen: {agent.generation}</span>
        </div>
        <div className="stat-row">
          <span>Action: {ACTION_NAMES[agent.lastAction]}</span>
        </div>
        <div className="stat-row">
          <span>Kills: {agent.kills}</span>
          <span>Offspring: {agent.offspring}</span>
          <span>Food: {agent.foodEaten}</span>
        </div>
      </div>

      <div className="inspector-section">
        <h4>Traits</h4>
        <div className="trait-grid">
          <TraitRow label="Speed" value={traits.speed} />
          <TraitRow label="Size" value={traits.size} />
          <TraitRow label="Perception" value={traits.perceptionRadius} />
          <TraitRow label="Metabolism" value={traits.metabolism} />
          <TraitRow
            label="Repro Threshold"
            value={traits.reproductionThreshold}
          />
          <TraitRow label="Mutation Rate" value={traits.mutationRate} />
          <TraitRow label="Aggression Bias" value={traits.aggressionBias} />
          <TraitRow label="Social Bias" value={traits.socialBias} />
          <TraitRow label="Heat Tolerance" value={traits.heatTolerance} />
          <TraitRow label="Food Efficiency" value={traits.foodEfficiency} />
        </div>
      </div>

      <div className="inspector-section">
        <h4>Psychology</h4>
        <div className="stat-grid compact">
          <StatBar label="Fear" value={psy.fear} max={1} color="#9C27B0" />
          <StatBar
            label="Aggression"
            value={psy.aggression}
            max={1}
            color="#F44336"
          />
          <StatBar
            label="Curiosity"
            value={psy.curiosity}
            max={1}
            color="#FF9800"
          />
          <StatBar
            label="Social"
            value={psy.socialBonding}
            max={1}
            color="#2196F3"
          />
          <StatBar label="Hunger" value={psy.hunger} max={1} color="#795548" />
          <StatBar label="Thirst" value={psy.thirst} max={1} color="#0288D1" />
          <StatBar
            label="Fatigue"
            value={psy.fatigue}
            max={1}
            color="#607D8B"
          />
        </div>
      </div>

      <div className="inspector-section">
        <h4>Memory ({agent.memory.length} entries)</h4>
        <div className="memory-list">
          {agent.memory
            .slice(-5)
            .reverse()
            .map((m, i) => (
              <div key={i} className="memory-entry">
                <span className={`memory-type ${m.type}`}>{m.type}</span>
                <span>
                  ({m.x}, {m.y})
                </span>
                <span>{m.intensity.toFixed(2)}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};

const TileInspector: React.FC<{ x: number; y: number; world: World }> = ({
  x,
  y,
  world,
}) => {
  if (!world.isValid(x, y)) return <p className="muted">Invalid tile.</p>;
  const tile = world.tileAt(x, y);

  return (
    <div className="inspector-content">
      <div className="inspector-header">
        <span>
          Tile ({x}, {y})
        </span>
        <span className="terrain-badge">{TERRAIN_NAMES[tile.terrain]}</span>
      </div>

      <div className="stat-grid compact">
        <StatBar
          label="Food"
          value={tile.foodResource}
          max={100}
          color="#4CAF50"
        />
        <StatBar
          label="Water"
          value={tile.waterResource}
          max={100}
          color="#2196F3"
        />
        <StatBar
          label="Fertility"
          value={tile.fertility}
          max={1}
          color="#8BC34A"
        />
        <StatBar label="Hazard" value={tile.hazard} max={1} color="#F44336" />
      </div>

      <div className="stat-row">
        <span>Temperature: {tile.temperature.toFixed(1)}°C</span>
      </div>
      <div className="stat-row">
        <span>Humidity: {(tile.humidity * 100).toFixed(0)}%</span>
      </div>
      <div className="stat-row">
        <span>Elevation: {(tile.elevation * 100).toFixed(0)}%</span>
      </div>
      <div className="stat-row">
        <span>Energy: {tile.energy.toFixed(1)}</span>
      </div>
    </div>
  );
};

const StatBar: React.FC<{
  label: string;
  value: number;
  max: number;
  color: string;
}> = ({ label, value, max, color }) => {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="stat-bar">
      <div className="stat-bar-label">
        <span>{label}</span>
        <span>{value.toFixed(1)}</span>
      </div>
      <div className="stat-bar-track">
        <div
          className="stat-bar-fill"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
};

const TraitRow: React.FC<{ label: string; value: number }> = ({
  label,
  value,
}) => (
  <div className="trait-row">
    <span className="trait-label">{label}</span>
    <span className="trait-value">{value.toFixed(3)}</span>
  </div>
);
