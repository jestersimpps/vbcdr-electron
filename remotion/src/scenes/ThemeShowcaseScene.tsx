import React from "react";
import {
  AbsoluteFill,
  spring,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from "remotion";
import { THEMES, GITHUB_DARK } from "../lib/colors";
import { FONTS } from "../lib/constants";
import { GradientBackground } from "../components/GradientBackground";

export const ThemeShowcaseScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleProgress = spring({
    fps,
    frame,
    config: { damping: 18, stiffness: 120, mass: 0.6 },
  });

  return (
    <AbsoluteFill>
      <GradientBackground
        orbs={[
          { color: "#bd93f9", x: "25%", y: "30%", size: 350, blur: 130, drift: { x: 5, y: -3 } },
          { color: "#ff79c6", x: "75%", y: "70%", size: 300, blur: 140, drift: { x: -5, y: 3 } },
          { color: "#8be9fd", x: "50%", y: "50%", size: 250, blur: 150, drift: { x: 0, y: 0 } },
        ]}
        gridOpacity={0.02}
      />

      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          padding: 80,
          perspective: 1000,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 44,
            width: "100%",
            transform: "perspective(1000px) rotateX(2deg)",
            transformStyle: "preserve-3d",
          }}
        >
          <h2
            style={{
              fontSize: 50,
              fontFamily: FONTS.UI,
              fontWeight: 700,
              color: GITHUB_DARK.fg,
              margin: 0,
              opacity: titleProgress,
              textShadow: "0 4px 20px rgba(0,0,0,0.6)",
              transform: `translateZ(${titleProgress * 20}px)`,
            }}
          >
            11 Themes with Dark & Light Variants
          </h2>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              width: "100%",
              maxWidth: 1400,
            }}
          >
            {THEMES.map((theme, i) => {
              const rowDelay = 8 + i * 3;
              const rowAdjusted = Math.max(0, frame - rowDelay);

              const rowProgress = spring({
                fps,
                frame: rowAdjusted,
                config: { damping: 20, stiffness: 140, mass: 0.5 },
              });

              const rowZ = interpolate(rowProgress, [0, 1], [-30, 0]);

              return (
                <div
                  key={theme.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 20,
                    opacity: rowProgress,
                    transform: `translateX(${-30 * (1 - rowProgress)}px) translateZ(${rowZ}px)`,
                  }}
                >
                  <span
                    style={{
                      fontSize: 19,
                      fontFamily: FONTS.UI,
                      fontWeight: 500,
                      color: GITHUB_DARK.fgSecondary,
                      width: 150,
                      textAlign: "right",
                      flexShrink: 0,
                      textShadow: "0 1px 4px rgba(0,0,0,0.4)",
                    }}
                  >
                    {theme.name}
                  </span>

                  <div
                    style={{
                      display: "flex",
                      flex: 1,
                      height: 38,
                      borderRadius: 8,
                      overflow: "hidden",
                      boxShadow: `0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)`,
                      border: `1px solid ${GITHUB_DARK.bg700}40`,
                    }}
                  >
                    <div
                      style={{
                        width: 70,
                        backgroundColor: theme.bg,
                      }}
                    />
                    {theme.accents.map((color, j) => {
                      const swatchDelay = rowDelay + 5 + j * 2;
                      const swatchWidth = interpolate(
                        frame,
                        [swatchDelay, swatchDelay + 8],
                        [0, 1],
                        { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
                      );

                      return (
                        <div
                          key={j}
                          style={{
                            flex: swatchWidth,
                            backgroundColor: color,
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
