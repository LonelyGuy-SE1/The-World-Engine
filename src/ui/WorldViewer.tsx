import React, { useRef, useEffect, useCallback, useState } from "react";
import {
  CanvasRenderer,
  RenderConfig,
  DEFAULT_RENDER_CONFIG,
} from "../renderer/CanvasRenderer";
import { Simulation, SimulationInstance } from "../engine/Simulation";
import { Agent } from "../engine/types";

interface WorldViewerProps {
  simulation: Simulation;
  instance: SimulationInstance | null;
  onSelectAgent: (agent: Agent | null) => void;
  onSelectTile: (x: number, y: number) => void;
  renderConfig: RenderConfig;
  placementTool: string;
}

export const WorldViewer: React.FC<WorldViewerProps> = ({
  simulation,
  instance,
  onSelectAgent,
  onSelectTile,
  renderConfig,
  placementTool,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CanvasRenderer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const isDragging = useRef(false);
  const isPainting = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  // Initialize renderer
  useEffect(() => {
    if (!canvasRef.current) return;
    rendererRef.current = new CanvasRenderer(canvasRef.current, renderConfig);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        rendererRef.current?.resize(width, height);
      }
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
      const rect = containerRef.current.getBoundingClientRect();
      rendererRef.current.resize(rect.width, rect.height);
    }

    // Center camera on world
    if (instance) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        rendererRef.current.centerOn(
          instance.world.width / 2,
          instance.world.height / 2,
          rect.width,
          rect.height,
        );
      }
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [instance?.id]);

  // Update render config
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.config = {
        ...rendererRef.current.config,
        ...renderConfig,
      };
    }
  }, [renderConfig]);

  // Animation loop
  useEffect(() => {
    const animate = () => {
      if (instance && rendererRef.current) {
        rendererRef.current.render(
          instance.world,
          instance.agents,
          instance.speciesRegistry,
          instance.tick,
        );
        simulation.step();
      }
      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [instance, simulation]);

  // Mouse handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (placementTool !== "none") {
        isPainting.current = true;
        if (!rendererRef.current || !instance) return;
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const worldPos = rendererRef.current.screenToWorld(
          e.clientX - rect.left,
          e.clientY - rect.top,
        );
        onSelectTile(worldPos.x, worldPos.y);
      } else {
        isDragging.current = true;
      }
      lastMouse.current = { x: e.clientX, y: e.clientY };
    },
    [placementTool, instance, onSelectTile],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (
        isPainting.current &&
        placementTool !== "none" &&
        rendererRef.current &&
        instance
      ) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const worldPos = rendererRef.current.screenToWorld(
          e.clientX - rect.left,
          e.clientY - rect.top,
        );
        onSelectTile(worldPos.x, worldPos.y);
      } else if (isDragging.current && rendererRef.current) {
        const dx = lastMouse.current.x - e.clientX;
        const dy = lastMouse.current.y - e.clientY;
        rendererRef.current.pan(dx, dy);
        lastMouse.current = { x: e.clientX, y: e.clientY };
      }
    },
    [placementTool, instance, onSelectTile],
  );

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    isPainting.current = false;
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (rendererRef.current) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const factor = e.deltaY < 0 ? 1.15 : 0.87;
        rendererRef.current.zoomAt(
          factor,
          e.clientX - rect.left,
          e.clientY - rect.top,
        );
      }
    }
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!rendererRef.current || !instance) return;
      if (placementTool !== "none") return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const worldPos = rendererRef.current.screenToWorld(
        e.clientX - rect.left,
        e.clientY - rect.top,
      );

      onSelectTile(worldPos.x, worldPos.y);

      const agent = instance.agents.find(
        (a) => a.alive && a.x === worldPos.x && a.y === worldPos.y,
      );
      onSelectAgent(agent || null);

      if (rendererRef.current) {
        rendererRef.current.config.selectedAgentId = agent?.id ?? null;
      }
    },
    [instance, onSelectAgent, onSelectTile, placementTool],
  );

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        cursor:
          placementTool !== "none"
            ? "crosshair"
            : isDragging.current
              ? "grabbing"
              : "grab",
      }}
    >
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onClick={handleClick}
        style={{ display: "block", width: "100%", height: "100%" }}
      />
    </div>
  );
};
