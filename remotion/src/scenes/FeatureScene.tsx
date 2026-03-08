import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { GITHUB_DARK } from "../lib/colors";
import { FeatureCard } from "../components/FeatureCard";
import { GradientBackground } from "../components/GradientBackground";

interface FeatureSceneProps {
  title: string;
  bullets: readonly string[];
  accentColor: string;
  index: number;
}

export const FeatureScene: React.FC<FeatureSceneProps> = ({
  title,
  bullets,
  accentColor,
  index,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const counterProgress = spring({
    fps,
    frame,
    config: { damping: 15, stiffness: 60, mass: 1.5 },
  });

  const counterScale = interpolate(counterProgress, [0, 1], [0.5, 1]);
  const counterRotate = interpolate(counterProgress, [0, 1], [15, 0]);

  return (
    <AbsoluteFill>
      <GradientBackground
        orbs={[
          { color: accentColor, x: "70%", y: "50%", size: 500, blur: 130, drift: { x: -10, y: 5 } },
          { color: accentColor, x: "20%", y: "30%", size: 250, blur: 160, drift: { x: 8, y: -5 } },
        ]}
      />

      <AbsoluteFill
        style={{
          justifyContent: "center",
          paddingLeft: 160,
          perspective: 800,
        }}
      >
        <span
          style={{
            position: "absolute",
            right: 100,
            top: "50%",
            fontSize: 320,
            fontWeight: 900,
            color: accentColor,
            opacity: interpolate(counterProgress, [0, 1], [0, 0.12]),
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            transform: `translateY(-50%) perspective(600px) rotateY(${counterRotate}deg) scale(${counterScale})`,
            textShadow: `0 0 60px ${accentColor}30`,
            lineHeight: 1,
          }}
        >
          {String(index + 1).padStart(2, "0")}
        </span>

        <div
          style={{
            transform: "perspective(800px) rotateY(1deg)",
            transformStyle: "preserve-3d",
          }}
        >
          <FeatureCard
            title={title}
            bullets={bullets}
            accentColor={accentColor}
            delay={5}
          />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
