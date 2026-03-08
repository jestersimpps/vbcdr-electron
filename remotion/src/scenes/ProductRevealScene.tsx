import React from "react";
import {
  AbsoluteFill,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from "remotion";
import { GITHUB_DARK } from "../lib/colors";
import { MacWindow } from "../components/MacWindow";
import { GradientBackground } from "../components/GradientBackground";

export const ProductRevealScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const slideUp = spring({
    fps,
    frame,
    config: { damping: 12, stiffness: 60, mass: 1.2 },
  });

  const scale = interpolate(slideUp, [0, 1], [0.85, 1]);
  const translateY = interpolate(slideUp, [0, 1], [300, 0]);
  const rotateX = interpolate(slideUp, [0, 1], [15, 2]);
  const shadowSpread = interpolate(slideUp, [0, 1], [10, 60]);

  return (
    <AbsoluteFill>
      <GradientBackground
        orbs={[
          { color: GITHUB_DARK.accent, x: "50%", y: "35%", size: 700, blur: 100, drift: { x: 0, y: -8 } },
          { color: GITHUB_DARK.magenta, x: "20%", y: "65%", size: 400, blur: 140, drift: { x: 12, y: 5 } },
          { color: GITHUB_DARK.green, x: "80%", y: "70%", size: 350, blur: 130, drift: { x: -8, y: 3 } },
        ]}
        gridOpacity={0.03}
      />

      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          perspective: 1200,
        }}
      >
        <div
          style={{
            transform: `perspective(1200px) translateY(${translateY}px) rotateX(${rotateX}deg) scale(${scale})`,
            opacity: slideUp,
            transformStyle: "preserve-3d",
          }}
        >
          <MacWindow
            width={1500}
            style={{
              boxShadow: `
                0 ${shadowSpread}px ${shadowSpread * 2}px rgba(0,0,0,0.5),
                0 0 ${shadowSpread * 1.5}px ${GITHUB_DARK.accent}15,
                inset 0 1px 0 rgba(255,255,255,0.05)
              `,
            }}
          >
            <img
              src={staticFile("screenshot-app.png")}
              style={{
                width: "100%",
                display: "block",
              }}
            />
          </MacWindow>
        </div>
      </AbsoluteFill>

      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 250,
          background: `linear-gradient(transparent, ${GITHUB_DARK.bg950})`,
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
