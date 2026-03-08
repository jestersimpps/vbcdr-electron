import React from "react";
import { AbsoluteFill, Series } from "remotion";
import { SCENES, CONTENT } from "../lib/constants";
import { GITHUB_DARK } from "../lib/colors";
import { IntroScene } from "../scenes/IntroScene";
import { ProblemScene } from "../scenes/ProblemScene";
import { PhilosophyScene } from "../scenes/PhilosophyScene";
import { ProductRevealScene } from "../scenes/ProductRevealScene";
import { FeatureScene } from "../scenes/FeatureScene";
import { ThemeShowcaseScene } from "../scenes/ThemeShowcaseScene";
import { OutroScene } from "../scenes/OutroScene";

const FEATURE_ACCENTS = [
  GITHUB_DARK.accent,
  GITHUB_DARK.green,
  GITHUB_DARK.magenta,
  GITHUB_DARK.yellow,
];

export const VbcdrDemo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: GITHUB_DARK.bg950 }}>
      <Series>
        <Series.Sequence durationInFrames={SCENES.INTRO.duration}>
          <IntroScene />
        </Series.Sequence>

        <Series.Sequence durationInFrames={SCENES.PROBLEM.duration}>
          <ProblemScene />
        </Series.Sequence>

        <Series.Sequence durationInFrames={SCENES.PHILOSOPHY.duration}>
          <PhilosophyScene />
        </Series.Sequence>

        <Series.Sequence durationInFrames={SCENES.PRODUCT_REVEAL.duration}>
          <ProductRevealScene />
        </Series.Sequence>

        {CONTENT.FEATURES.map((feature, i) => {
          const durations = [
            SCENES.FEATURE_TERMINAL.duration,
            SCENES.FEATURE_BROWSER.duration,
            SCENES.FEATURE_SEND_TO_CLAUDE.duration,
            SCENES.FEATURE_WORKSPACE.duration,
          ];

          return (
            <Series.Sequence key={feature.title} durationInFrames={durations[i]}>
              <FeatureScene
                title={feature.title}
                bullets={feature.bullets}
                accentColor={FEATURE_ACCENTS[i]}
                index={i}
              />
            </Series.Sequence>
          );
        })}

        <Series.Sequence durationInFrames={SCENES.THEME_SHOWCASE.duration}>
          <ThemeShowcaseScene />
        </Series.Sequence>

        <Series.Sequence durationInFrames={SCENES.OUTRO.duration}>
          <OutroScene />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};
