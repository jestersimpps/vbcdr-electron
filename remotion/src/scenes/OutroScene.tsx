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

export const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoProgress = spring({
    fps,
    frame,
    config: { damping: 10, stiffness: 80, mass: 1 },
  });

  const urlProgress = spring({
    fps,
    frame: Math.max(0, frame - 15),
    config: { damping: 20, stiffness: 120, mass: 0.6 },
  });

  const taglineProgress = spring({
    fps,
    frame: Math.max(0, frame - 25),
    config: { damping: 20, stiffness: 120, mass: 0.6 },
  });

  const rotateX = interpolate(logoProgress, [0, 1], [20, 0]);
  const logoZ = interpolate(logoProgress, [0, 1], [-150, 0]);

  return (
    <AbsoluteFill>
      <GradientBackground
        orbs={[
          { color: GITHUB_DARK.accent, x: "50%", y: "40%", size: 600, blur: 100, drift: { x: 0, y: -8 } },
          { color: GITHUB_DARK.magenta, x: "30%", y: "60%", size: 400, blur: 130, drift: { x: 10, y: 5 } },
          { color: GITHUB_DARK.green, x: "70%", y: "55%", size: 350, blur: 140, drift: { x: -8, y: 3 } },
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
            transform: `perspective(1000px) rotateX(${rotateX}deg) translateZ(${logoZ}px)`,
            transformStyle: "preserve-3d",
          }}
        >
          <h1
            style={{
              fontSize: 110,
              fontFamily: FONTS.MONO,
              fontWeight: 800,
              color: GITHUB_DARK.fg,
              margin: 0,
              letterSpacing: -3,
              textShadow: `
                0 0 50px ${GITHUB_DARK.accent}50,
                0 0 100px ${GITHUB_DARK.accent}20,
                0 6px 30px rgba(0,0,0,0.8)
              `,
            }}
          >
            {CONTENT.APP_NAME}
          </h1>

          <div
            style={{
              opacity: urlProgress,
              transform: `translateY(${10 * (1 - urlProgress)}px)`,
              padding: "10px 28px",
              borderRadius: 10,
              background: `linear-gradient(135deg, ${GITHUB_DARK.bg800}80, ${GITHUB_DARK.bg900}80)`,
              backdropFilter: "blur(10px)",
              border: `1px solid ${GITHUB_DARK.bg700}60`,
              boxShadow: `0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)`,
            }}
          >
            <p
              style={{
                fontSize: 28,
                fontFamily: FONTS.MONO,
                fontWeight: 500,
                color: GITHUB_DARK.accent,
                margin: 0,
                textShadow: `0 0 20px ${GITHUB_DARK.accent}40`,
              }}
            >
              {CONTENT.GITHUB_URL}
            </p>
          </div>

          <p
            style={{
              fontSize: 24,
              fontFamily: FONTS.UI,
              fontWeight: 400,
              color: GITHUB_DARK.fgMuted,
              margin: 0,
              opacity: taglineProgress,
              transform: `translateY(${10 * (1 - taglineProgress)}px)`,
              textShadow: "0 2px 8px rgba(0,0,0,0.5)",
            }}
          >
            {CONTENT.TAGLINE}
          </p>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
