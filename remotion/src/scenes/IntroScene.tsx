import React from "react";
import {
  AbsoluteFill,
  spring,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from "remotion";
import { GITHUB_DARK } from "../lib/colors";
import { FONTS, CONTENT } from "../lib/constants";
import { GradientBackground } from "../components/GradientBackground";

export const IntroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const nameProgress = spring({
    fps,
    frame,
    config: { damping: 10, stiffness: 80, mass: 1 },
  });

  const taglineProgress = spring({
    fps,
    frame: Math.max(0, frame - 20),
    config: { damping: 20, stiffness: 120, mass: 0.6 },
  });

  const rotateX = interpolate(nameProgress, [0, 1], [25, 0]);
  const nameScale = interpolate(nameProgress, [0, 1], [0.6, 1]);
  const nameZ = interpolate(nameProgress, [0, 1], [-200, 0]);

  return (
    <AbsoluteFill>
      <GradientBackground
        orbs={[
          { color: GITHUB_DARK.accent, x: "50%", y: "45%", size: 600, blur: 100, drift: { x: 0, y: -10 } },
          { color: GITHUB_DARK.magenta, x: "25%", y: "55%", size: 350, blur: 140, drift: { x: 15, y: 5 } },
          { color: GITHUB_DARK.cyan, x: "75%", y: "35%", size: 300, blur: 130, drift: { x: -10, y: 8 } },
        ]}
      />

      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          perspective: 1000,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 28,
            transform: `perspective(1000px) rotateX(${rotateX}deg) scale(${nameScale}) translateZ(${nameZ}px)`,
            transformStyle: "preserve-3d",
          }}
        >
          <h1
            style={{
              fontSize: 140,
              fontFamily: FONTS.MONO,
              fontWeight: 800,
              color: GITHUB_DARK.fg,
              margin: 0,
              letterSpacing: -4,
              textShadow: `
                0 0 40px ${GITHUB_DARK.accent}60,
                0 0 80px ${GITHUB_DARK.accent}30,
                0 4px 20px rgba(0,0,0,0.8)
              `,
            }}
          >
            {CONTENT.APP_NAME}
          </h1>

          <p
            style={{
              fontSize: 36,
              fontFamily: FONTS.UI,
              fontWeight: 400,
              color: GITHUB_DARK.fgMuted,
              margin: 0,
              opacity: taglineProgress,
              transform: `translateY(${15 * (1 - taglineProgress)}px)`,
              textShadow: "0 2px 10px rgba(0,0,0,0.5)",
            }}
          >
            {CONTENT.TAGLINE}
          </p>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
