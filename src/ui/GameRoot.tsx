/**
 * The heavy half of the app.
 *
 * Everything that pulls in three, rapier or postprocessing lives behind this
 * module, which the shell loads lazily. That is what keeps the initial
 * payload inside the 250KB gzip budget: the title screen is a few kilobytes
 * of React, and the 3D runtime only arrives once the player presses Play.
 */

import { Canvas } from '@react-three/fiber';
import { GameScene } from '../render/GameScene';
import { useGame } from '../state/store';

export default function GameRoot(): React.ReactElement {
  const exposure = useGame((s) => s.save.settings.exposure);
  void exposure;
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ position: [0, 3, 6], fov: 55, near: 0.1, far: 400 }}
      gl={{ antialias: true, powerPreference: 'high-performance', stencil: false }}
    >
      <GameScene />
    </Canvas>
  );
}
