import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { FONTS } from "../lib/constants";

interface AnimatedTextProps {
  text: string;
  fontSize?: number;
  color?: string;
  delay?: number;
  staggerFrames?: number;
  fontFamily?: string;
  fontWeight?: number;
  style?: React.CSSProperties;
}

export const AnimatedText: React.FC<AnimatedTextProps> = ({
  text,
  fontSize = 48,
  color = "#e6edf3",
  delay = 0,
  staggerFrames = 3,
  fontFamily = FONTS.UI,
  fontWeight = 600,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(" ");

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: fontSize * 0.3,
        justifyContent: "center",
        ...style,
      }}
    >
      {words.map((word, i) => {
        const wordDelay = delay + i * staggerFrames;
        const adjusted = Math.max(0, frame - wordDelay);

        const progress = spring({
          fps,
          frame: adjusted,
          config: { damping: 18, stiffness: 120, mass: 0.6 },
        });

        return (
          <span
            key={i}
            style={{
              fontSize,
              fontFamily,
              fontWeight,
              color,
              opacity: progress,
              transform: `translateY(${20 * (1 - progress)}px)`,
              display: "inline-block",
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};
