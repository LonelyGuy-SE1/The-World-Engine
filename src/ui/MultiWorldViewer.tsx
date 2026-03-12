import React, { useRef, useEffect, useCallback } from "react";
import {
  CanvasRenderer,
  DEFAULT_RENDER_CONFIG,
} from "../renderer/CanvasRenderer";
import { SimulationInstance } from "../engine/Simulation";

interface MiniWorldCanvasProps {
  instance: SimulationInstance;
  isActive: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
}

const MiniWorldCanvas: React.FC<MiniWorldCanvasProps> = ({
  instance,
  isActive,
  onClick,
  onDoubleClick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<CanvasRenderer | null>(null);
  const frameRef = useRef(0);

  useEffect(() => {
    if (!canvasRef.current) return;
    rendererRef.current = new CanvasRenderer(canvasRef.current, {
      ...DEFAULT_RENDER_CONFIG,
      tileSize: 4,
      showGrid: false,
    });

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (rendererRef.current) {
          rendererRef.current.resize(width, height);
          rendererRef.current.centerOn(
            instance.world.width / 2,
            instance.world.height / 2,
            width,
            height,
          );
          const scaleX = width / (instance.world.width * 4);
          const scaleY = height / (instance.world.height * 4);
          rendererRef.current.zoom = Math.min(scaleX, scaleY) * 0.95;
        }
      }
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
      const rect = containerRef.current.getBoundingClientRect();
      rendererRef.current.resize(rect.width, rect.height);
      rendererRef.current.centerOn(
        instance.world.width / 2,
        instance.world.height / 2,
        rect.width,
        rect.height,
      );
      const scaleX = rect.width / (instance.world.width * 4);
      const scaleY = rect.height / (instance.world.height * 4);
      rendererRef.current.zoom = Math.min(scaleX, scaleY) * 0.95;
    }

    return () => resizeObserver.disconnect();
  }, [instance.id]);

  useEffect(() => {
    const animate = () => {
      if (rendererRef.current) {
        rendererRef.current.render(
          instance.world,
          instance.agents,
          instance.speciesRegistry,
          instance.tick,
        );
      }
      frameRef.current = requestAnimationFrame(animate);
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [instance]);

  return (
    <div
      ref={containerRef}
      className={`multi-world-cell ${isActive ? "active" : ""}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <div className="multi-world-label">{instance.name}</div>
      <div className="multi-world-stats">
        Pop: {instance.stats.totalAgents} | Yr:{" "}
        {Math.floor(instance.tick / instance.world.config.ticksPerYear)}
      </div>
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      />
    </div>
  );
};

interface MultiWorldViewerProps {
  instances: SimulationInstance[];
  activeId: string | null;
  onSelectInstance: (id: string) => void;
  onExpandInstance: (id: string) => void;
}

export const MultiWorldViewer: React.FC<MultiWorldViewerProps> = ({
  instances,
  activeId,
  onSelectInstance,
  onExpandInstance,
}) => {
  const cols =
    instances.length <= 1
      ? 1
      : instances.length <= 4
        ? 2
        : instances.length <= 9
          ? 3
          : 4;

  return (
    <div
      className="multi-world-grid"
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
    >
      {instances.map((inst) => (
        <MiniWorldCanvas
          key={inst.id}
          instance={inst}
          isActive={inst.id === activeId}
          onClick={() => onSelectInstance(inst.id)}
          onDoubleClick={() => onExpandInstance(inst.id)}
        />
      ))}
    </div>
  );
};
