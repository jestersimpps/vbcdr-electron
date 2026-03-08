import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { GITHUB_DARK } from "../lib/colors";
import { FONTS } from "../lib/constants";

interface FeatureCardProps {
  title: string;
  bullets: readonly string[];
  accentColor?: string;
  delay?: number;
}

export const FeatureCard: React.FC<FeatureCardProps> = ({
  title,
  bullets,
  accentColor = GITHUB_DARK.accent,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const adjusted = Math.max(0, frame - delay);

  const titleProgress = spring({
    fps,
    frame: adjusted,
    config: { damping: 18, stiffness: 150, mass: 0.7 },
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 32,
        maxWidth: 900,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 24,
          opacity: titleProgress,
          transform: `translateX(${-40 * (1 - titleProgress)}px)`,
        }}
      >
        <div
          style={{
            width: 6,
            height: 56,
            borderRadius: 3,
            background: `linear-gradient(180deg, ${accentColor}, ${accentColor}60)`,
            boxShadow: `0 0 20px ${accentColor}40`,
          }}
        />
        <h2
          style={{
            fontSize: 60,
            fontFamily: FONTS.UI,
            fontWeight: 700,
            color: GITHUB_DARK.fg,
            margin: 0,
            textShadow: `0 2px 16px rgba(0,0,0,0.5), 0 0 40px ${accentColor}15`,
          }}
        >
          {title}
        </h2>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingLeft: 30 }}>
        {bullets.map((bullet, i) => {
          const bulletDelay = delay + 12 + i * 8;
          const bulletAdjusted = Math.max(0, frame - bulletDelay);

          const bulletProgress = spring({
            fps,
            frame: bulletAdjusted,
            config: { damping: 20, stiffness: 130, mass: 0.6 },
          });

          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 18,
                opacity: bulletProgress,
                transform: `translateX(${-25 * (1 - bulletProgress)}px)`,
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: `radial-gradient(circle, ${accentColor}, ${accentColor}80)`,
                  boxShadow: `0 0 12px ${accentColor}50`,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: 34,
                  fontFamily: FONTS.UI,
                  fontWeight: 400,
                  color: GITHUB_DARK.fgSecondary,
                  textShadow: "0 1px 6px rgba(0,0,0,0.3)",
                }}
              >
                {bullet}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
