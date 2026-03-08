import React from "react";
import { Composition } from "remotion";
import { VbcdrDemo } from "./compositions/VbcdrDemo";
import { VIDEO, TOTAL_DURATION } from "./lib/constants";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="VbcdrDemo"
        component={VbcdrDemo}
        durationInFrames={TOTAL_DURATION}
        fps={VIDEO.FPS}
        width={VIDEO.WIDTH}
        height={VIDEO.HEIGHT}
      />
    </>
  );
};
