import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { GITHUB_DARK } from "../lib/colors";
import { CONTENT } from "../lib/constants";
import { AnimatedText } from "../components/AnimatedText";
import { GradientBackground } from "../components/GradientBackground";

export const ProblemScene: React.FC = () => {
  const frame = useCurrentFrame();

  const lineOpacity = interpolate(frame, [20, 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const lineWidth = interpolate(frame, [20, 60], [0, 200], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const glowIntensity = interpolate(frame, [40, 80], [0, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      <GradientBackground
        orbs={[
          { color: GITHUB_DARK.red, x: "50%", y: "50%", size: 500, blur: 150, drift: { x: 0, y: 0 } },
          { color: "#ff4500", x: "30%", y: "60%", size: 300, blur: 160, drift: { x: 10, y: -5 } },
        ]}
      />

      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          perspective: 800,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 36,
            transform: "perspective(800px) rotateX(2deg)",
          }}
        >
          <AnimatedText
            text={CONTENT.PROBLEM}
            fontSize={68}
            color={GITHUB_DARK.fg}
            staggerFrames={4}
            fontWeight={700}
            style={{ textShadow: "0 4px 24px rgba(0,0,0,0.6)" }}
          />

          <div
            style={{
              width: lineWidth,
              height: 4,
              borderRadius: 2,
              background: `linear-gradient(90deg, transparent, ${GITHUB_DARK.red}, transparent)`,
              opacity: lineOpacity,
              boxShadow: `0 0 30px ${GITHUB_DARK.red}${Math.round(glowIntensity * 255).toString(16).padStart(2, "0")}`,
            }}
          />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
