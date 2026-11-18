import React from "react";
import { Composition } from "remotion";
import { DesempleoShort } from "./videos/desempleo/Video";
import { TOTAL, FPS } from "./videos/desempleo/story";
export const Root: React.FC = () => (
  <>
    <Composition id="Desempleo" component={DesempleoShort} durationInFrames={TOTAL} fps={FPS} width={1080} height={1920} />
  </>
);
