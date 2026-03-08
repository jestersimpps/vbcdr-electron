import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { GITHUB_DARK } from "../lib/colors";

interface OrbConfig {
  color: string;
  x: string;
  y: string;
  size: number;
  blur: number;
  drift?: { x: number; y: number };
}

interface GradientBackgroundProps {
  orbs?: OrbConfig[];
  baseColor?: string;
  gridOpacity?: number;
}

const DEFAULT_ORBS: OrbConfig[] = [
  { color: GITHUB_DARK.accent, x: "30%", y: "40%", size: 500, blur: 120, drift: { x: 20, y: -15 } },
  { color: GITHUB_DARK.magenta, x: "70%", y: "60%", size: 400, blur: 140, drift: { x: -15, y: 10 } },
];

export const GradientBackground: React.FC<GradientBackgroundProps> = ({
  orbs = DEFAULT_ORBS,
  baseColor = GITHUB_DARK.bg950,
  gridOpacity = 0.04,
}) => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ backgroundColor: baseColor, overflow: "hidden" }}>
      {orbs.map((orb, i) => {
        const drift = orb.drift ?? { x: 0, y: 0 };
        const driftX = interpolate(frame, [0, 120], [0, drift.x], {
          extrapolateRight: "clamp",
        });
        const driftY = interpolate(frame, [0, 120], [0, drift.y], {
          extrapolateRight: "clamp",
        });
        const pulse = interpolate(
          Math.sin(frame * 0.03 + i * 2),
          [-1, 1],
          [0.12, 0.25]
        );

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: orb.x,
              top: orb.y,
              width: orb.size,
              height: orb.size,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${orb.color}, transparent 70%)`,
              filter: `blur(${orb.blur}px)`,
              opacity: pulse,
              transform: `translate(-50%, -50%) translate(${driftX}px, ${driftY}px)`,
            }}
          />
        );
      })}

      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(255,255,255,${gridOpacity}) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,${gridOpacity}) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse at 50% 50%, transparent 40%, ${baseColor} 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};
