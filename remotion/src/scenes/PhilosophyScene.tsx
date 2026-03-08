import React from "react";
import { AbsoluteFill } from "remotion";
import { GITHUB_DARK } from "../lib/colors";
import { CONTENT, FONTS } from "../lib/constants";
import { FadeIn } from "../components/FadeIn";
import { GradientBackground } from "../components/GradientBackground";

export const PhilosophyScene: React.FC = () => {
  return (
    <AbsoluteFill>
      <GradientBackground
        orbs={[
          { color: GITHUB_DARK.green, x: "40%", y: "45%", size: 500, blur: 130, drift: { x: 10, y: -8 } },
          { color: GITHUB_DARK.cyan, x: "65%", y: "55%", size: 350, blur: 150, drift: { x: -8, y: 5 } },
        ]}
      />

      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          padding: 140,
          perspective: 800,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 24,
            alignItems: "center",
            transform: "perspective(800px) rotateX(1deg)",
          }}
        >
          <FadeIn delay={0} direction="left" distance={60}>
            <p
              style={{
                fontSize: 54,
                fontFamily: FONTS.UI,
                fontWeight: 700,
                color: GITHUB_DARK.green,
                margin: 0,
                textAlign: "center",
                textShadow: `0 0 40px ${GITHUB_DARK.green}50, 0 4px 20px rgba(0,0,0,0.6)`,
              }}
            >
              {CONTENT.PHILOSOPHY_LINE_1}
            </p>
          </FadeIn>

          <FadeIn delay={20} direction="left" distance={40}>
            <p
              style={{
                fontSize: 40,
                fontFamily: FONTS.UI,
                fontWeight: 400,
                color: GITHUB_DARK.fgMuted,
                margin: 0,
                textAlign: "center",
                textShadow: "0 2px 12px rgba(0,0,0,0.5)",
              }}
            >
              {CONTENT.PHILOSOPHY_LINE_2}
            </p>
          </FadeIn>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
