import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";

interface FadeInProps {
  children: React.ReactNode;
  delay?: number;
  direction?: "up" | "down" | "left" | "right" | "none";
  distance?: number;
  style?: React.CSSProperties;
}

export const FadeIn: React.FC<FadeInProps> = ({
  children,
  delay = 0,
  direction = "up",
  distance = 40,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const adjusted = Math.max(0, frame - delay);

  const progress = spring({
    fps,
    frame: adjusted,
    config: { damping: 20, stiffness: 150, mass: 0.8 },
  });

  const offsets: Record<string, { x: number; y: number }> = {
    up: { x: 0, y: distance },
    down: { x: 0, y: -distance },
    left: { x: distance, y: 0 },
    right: { x: -distance, y: 0 },
    none: { x: 0, y: 0 },
  };

  const { x, y } = offsets[direction];

  return (
    <div
      style={{
        opacity: progress,
        transform: `translate(${x * (1 - progress)}px, ${y * (1 - progress)}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};
