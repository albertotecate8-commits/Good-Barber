import React from "react";
import { Composition } from "remotion";
import { AforeShort } from "./videos/afore/Afore";
import { TOTAL, FPS } from "./videos/afore/story";
export const Root: React.FC = () => (
  <>
    <Composition id="AforePro" component={AforeShort} durationInFrames={TOTAL} fps={FPS} width={1080} height={1920} />
  </>
);
