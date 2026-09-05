import { Suspense, lazy, useEffect } from 'react';
import { useGame } from '../state/store';
import { installTestHook } from '../systems/testHook';

// Lazy so three/rapier stay out of the initial bundle. See GameRoot's header.
const GameRoot = lazy(() => import('./GameRoot'));

export function App(): React.ReactElement {
  const load = useGame((s) => s.load);
  const setPhase = useGame((s) => s.setPhase);
  const persist = useGame((s) => s.persist);

  useEffect(() => {
    load();
    setPhase('playing');
    installTestHook(() => useGame.getState().phase);
  }, [load, setPhase]);

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

  return (
    <Suspense fallback={<BootScreen />}>
      <GameRoot />
    </Suspense>
  );
}

function BootScreen(): React.ReactElement {
  return (
    <div className="boot">
      <div className="boot__egg" aria-hidden="true" />
      <p>Getting the sanctuary ready…</p>
    </div>
  );
}
