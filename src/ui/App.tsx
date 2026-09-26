/**
 * The app shell.
 *
 * Deliberately thin: it loads the save, decides which screen is on top, and
 * lazy-loads the 3D runtime so the initial payload stays inside the bundle
 * budget. Everything else lives in its own component.
 */

import { Suspense, lazy, useEffect } from 'react';
import { useGame } from '../state/store';
import { installTestHook } from '../systems/testHook';
import { Hud } from './hud/Hud';
import { TitleScreen } from './TitleScreen';
import { PauseMenu } from './menus/PauseMenu';
import { SettingsPanel } from './menus/SettingsPanel';
import { ParentPanel } from './menus/ParentPanel';
import { ShopPanel } from './menus/ShopPanel';
import { FieldGuidePanel } from './menus/FieldGuidePanel';
import { AboutPanel } from './menus/AboutPanel';
import { BreakPrompt } from './BreakPrompt';
import { OfflineWelcome } from './OfflineWelcome';
import { TouchControls } from './TouchControls';
import { PerfOverlay } from './PerfOverlay';
import { PhotoMode } from './PhotoMode';
import { RevealCard } from './RevealCard';
import { AudioBridge } from './AudioBridge';
import { LoadingTips } from './LoadingTips';

// Lazy so three/rapier stay out of the initial bundle. See GameRoot's header.
const GameRoot = lazy(() => import('./GameRoot'));

export function App(): React.ReactElement {
  const load = useGame((s) => s.load);
  const persist = useGame((s) => s.persist);
  const phase = useGame((s) => s.phase);
  const menu = useGame((s) => s.activeMenu);
  const settings = useGame((s) => s.save.settings);

  useEffect(() => {
    load();
    installTestHook(
      () => useGame.getState().phase,
      () => useGame.getState().save.incubator?.remaining ?? null,
    );
  }, [load]);

  // Apply the accessibility settings that live in CSS rather than in the
  // renderer: UI scale and the reduced-motion class.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--ui-scale', String(settings.uiScale));
    root.classList.toggle('reduced-motion', settings.reducedMotion);
  }, [settings.uiScale, settings.reducedMotion]);

  // Save on the way out, so closing the tab never loses a hatchling.
  useEffect(() => {
    const onHide = (): void => {
      if (document.visibilityState === 'hidden') persist();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', persist);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', persist);
    };
  }, [persist]);

  // Autosave every fifteen seconds. Frequent enough that a crash costs almost
  // nothing, rare enough that it never touches a frame.
  useEffect(() => {
    const id = window.setInterval(persist, 15_000);
    return () => window.clearInterval(id);
  }, [persist]);

  const started = phase !== 'title';

  return (
    <>
      {started ? (
        <Suspense fallback={<BootScreen />}>
          <GameRoot />
        </Suspense>
      ) : null}

      {phase === 'title' ? <TitleScreen /> : null}

      <AudioBridge />
      <Hud />
      <PhotoMode />
      <TouchControls />
      <PerfOverlay />
      <RevealCard />

      {phase === 'paused' ? <PauseMenu /> : null}
      {menu === 'settings' ? <SettingsPanel /> : null}
      {menu === 'parents' ? <ParentPanel /> : null}
      {menu === 'shop' ? <ShopPanel /> : null}
      {menu === 'guide' ? <FieldGuidePanel /> : null}
      {menu === 'about' ? <AboutPanel /> : null}

      <OfflineWelcome />
      <BreakPrompt />
    </>
  );
}

function BootScreen(): React.ReactElement {
  return (
    <div className="boot">
      <div className="boot__egg" aria-hidden="true" />
      <p>Getting the sanctuary ready…</p>
      <LoadingTips />
    </div>
  );
}
