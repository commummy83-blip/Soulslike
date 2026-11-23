import { useCallback, useEffect, useRef, useState } from 'react';
import { CharacterMenu } from './components/CharacterMenu';
import { EndModal } from './components/EndModal';
import { GameHud } from './components/GameHud';
import { NpcOverlay } from './components/NpcOverlay';
import { SettingsModal } from './components/SettingsModal';
import { TitleScreen } from './components/TitleScreen';
import { soundEngine } from './game/audio';
import { computeDerivedStats } from './game/combatMath';
import { createInitialSaveState } from './game/data';
import {
  hasSavedGame,
  loadSaveState,
  loadSettings,
  persistSaveState,
  persistSettings,
} from './game/storage';
import type {
  EndRunSnapshot,
  GameSettings,
  GameShellState,
  LiveHudSnapshot,
  SaveState,
} from './game/types';
import { GameEngine, type VirtualInputState } from './game3d/GameEngine';

function makeInitialHud(save: SaveState): LiveHudSnapshot {
  const derived = computeDerivedStats(save);
  return {
    hp: derived.maxHp,
    maxHp: derived.maxHp,
    hpGhost: derived.maxHp,
    stamina: derived.maxStamina,
    maxStamina: derived.maxStamina,
    poise: derived.maxPoise,
    maxPoise: derived.maxPoise,
    estusCharges: save.estusCharges,
    estusMax: derived.estusMax,
    souls: save.souls,
    level: save.level,
    comboStep: 0,
    activeBuffTimer: 0,
    guarding: false,
    lockedTarget: null,
    bossTarget: null,
    interactionPrompt: null,
    zoneName: 'Ashfall Sanctum',
    weather: 'ash',
    statusBanner: null,
    statusEffects: save.statusEffects ?? [],
    iframeIntensity: 0,
    staggerFlashIntensity: 0,
    isStaggered: false,
  };
}

export default function App() {
  const initialAutostart =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === '1';

  const [shellState, setShellState] = useState<GameShellState>(
    initialAutostart ? 'playing' : 'title'
  );
  const [save, setSave] = useState<SaveState>(() => loadSaveState());
  const [settings, setSettings] = useState<GameSettings>(() => loadSettings());
  const [hud, setHud] = useState<LiveHudSnapshot>(() => makeInitialHud(loadSaveState()));
  const [endSnapshot, setEndSnapshot] = useState<EndRunSnapshot | null>(null);
  const [activeDrawer, setActiveDrawer] = useState<
    null | 'bonfire' | 'character' | 'npc' | 'merchant' | 'settings'
  >(null);
  const [savedExists, setSavedExists] = useState<boolean>(() => hasSavedGame());
  const [viewportWidth, setViewportWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1280
  );
  const [viewportHeight, setViewportHeight] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerHeight : 720
  );

  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const virtualInputRef = useRef<VirtualInputState | null>(null);

  // Refs synced for zero-restart access from 60fps Three.js loop
  const saveRef = useRef(save);
  saveRef.current = save;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const shellRef = useRef(shellState);
  shellRef.current = shellState;
  const activeDrawerRef = useRef(activeDrawer);
  activeDrawerRef.current = activeDrawer;

  const updateSave = useCallback((updater: (prev: SaveState) => SaveState) => {
    setSave((prev) => {
      const next = updater(prev);
      saveRef.current = next;
      persistSaveState(next);
      setSavedExists(true);
      return next;
    });
  }, []);

  const updateSettings = useCallback((next: GameSettings) => {
    setSettings(next);
    settingsRef.current = next;
    persistSettings(next);
    soundEngine.configure(next.masterVolume, next.muted);
  }, []);

  // Sync body dataset attributes for Game State Machine & modal pause guard
  useEffect(() => {
    document.body.dataset.state = shellState;
    if (shellState !== 'playing') {
      document.exitPointerLock?.();
      engineRef.current?.clearInputs();
    }
  }, [shellState]);

  useEffect(() => {
    document.body.dataset.modalOpen = activeDrawer ? '1' : '0';
    if (activeDrawer) {
      document.exitPointerLock?.();
      engineRef.current?.clearInputs();
    }
  }, [activeDrawer]);

  useEffect(() => {
    engineRef.current?.equipWeaponMesh(save);
  }, [save.equippedWeaponId]);

  useEffect(() => {
    engineRef.current?.rebuildPlayerAppearance(save);
  }, [
    save.appearance.armorTint,
    save.appearance.cloakTint,
    save.appearance.crestStyle,
    save.appearance.visorGlow,
  ]);

  useEffect(() => {
    const onResize = () => {
      setViewportWidth(window.innerWidth);
      setViewportHeight(window.innerHeight);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Mount Three.js Engine once
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const engine = new GameEngine(mount, {
      getSave: () => saveRef.current,
      updateSave,
      getSettings: () => settingsRef.current,
      getShellState: () => shellRef.current,
      onHudUpdate: (nextHud) => setHud(nextHud),
      onInteract: (_id, kind) => {
        if (kind === 'bonfire') {
          engine.restAtBonfire(true);
          setActiveDrawer('bonfire');
        } else if (kind === 'npc') {
          setActiveDrawer('npc');
        } else if (kind === 'merchant') {
          setActiveDrawer('merchant');
        }
      },
      onEndRun: (snap) => {
        setEndSnapshot(snap);
        setActiveDrawer(null);
        setShellState('gameover');
      },
      onPauseRequest: () => {
        if (activeDrawerRef.current) {
          setActiveDrawer(null);
        } else {
          setShellState('paused');
        }
      },
    });

    engineRef.current = engine;
    virtualInputRef.current = engine.virtualInput;

    if (
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('autostart') === '1' &&
      new URLSearchParams(window.location.search).get('boss') === '1'
    ) {
      engine.enterBossArena();
    }

    return () => {
      engine.dispose();
      engineRef.current = null;
      virtualInputRef.current = null;
    };
  }, [updateSave]);

  const startPlaying = useCallback(
    (isNewGame: boolean) => {
      soundEngine.uiClick();
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      if (isNewGame) {
        const fresh = createInitialSaveState();
        saveRef.current = fresh;
        setSave(fresh);
        persistSaveState(fresh);
        setSavedExists(true);
        engineRef.current?.rebuildPlayerAppearance(fresh);
        engineRef.current?.restAtBonfire(true);
      } else {
        engineRef.current?.restAtBonfire(false);
      }
      setActiveDrawer(null);
      setEndSnapshot(null);
      setShellState('playing');
      document.body.dataset.state = 'playing';
    },
    []
  );

  // Title Screen Enter/Space handshake + Tab character ledger shortcut
  useEffect(() => {
    const onGlobalKey = (e: KeyboardEvent) => {
      if (shellRef.current === 'title' && !activeDrawer) {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          startPlaying(!savedExists);
        }
      } else if (shellRef.current === 'playing') {
        if (e.code === 'Tab') {
          e.preventDefault();
          setActiveDrawer((prev) => (prev ? null : 'character'));
        } else if (e.code === 'Escape' && activeDrawer) {
          e.preventDefault();
          setActiveDrawer(null);
        }
      } else if (shellRef.current === 'paused') {
        if (e.code === 'Escape' || e.code === 'KeyP') {
          e.preventDefault();
          setShellState('playing');
        }
      }
    };
    window.addEventListener('keydown', onGlobalKey);
    return () => window.removeEventListener('keydown', onGlobalKey);
  }, [activeDrawer, savedExists, startPlaying]);

  const isTouchDevice =
    typeof window !== 'undefined' &&
    ('ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      viewportWidth < 820 ||
      viewportHeight < 500);
  const isTouchActive =
    settings.controlScheme === 'touch' ||
    (settings.controlScheme === 'auto' && isTouchDevice);

  return (
    <div
      data-mobile={isTouchActive ? '1' : '0'}
      className="relative w-full h-full overflow-hidden bg-[#090807]"
    >
      {/* Isolated WebGL Canvas Mount */}
      <div ref={canvasMountRef} data-testid="game-canvas" className="absolute inset-0" />

      {shellState === 'title' && (
        <TitleScreen
          hasSave={savedExists}
          settings={settings}
          isTouchActive={isTouchActive}
          onContinue={() => startPlaying(false)}
          onStartNew={() => startPlaying(true)}
          onOpenSettings={() => {
            soundEngine.uiClick();
            setActiveDrawer('settings');
          }}
        />
      )}

      {shellState === 'playing' && (
        <GameHud
          hud={hud}
          save={save}
          settings={settings}
          isTouchActive={isTouchActive}
          virtualInputRef={virtualInputRef}
          onToggleMute={() =>
            updateSettings({ ...settings, muted: !settings.muted })
          }
          onOpenPause={() => setShellState('paused')}
          onOpenCharacterMenu={() => setActiveDrawer('character')}
          onUseConsumable={(id) => engineRef.current?.useQuickConsumable(id)}
        />
      )}

      {(activeDrawer === 'bonfire' || activeDrawer === 'character') && (
        <CharacterMenu
          save={save}
          atBonfire={activeDrawer === 'bonfire'}
          onUpdateSave={updateSave}
          onEquipmentChanged={(s) => engineRef.current?.equipWeaponMesh(s)}
          onAppearanceChanged={(s) => engineRef.current?.rebuildPlayerAppearance(s)}
          onRestBonfire={() => engineRef.current?.restAtBonfire(true)}
          onClose={() => setActiveDrawer(null)}
        />
      )}

      {(activeDrawer === 'npc' || activeDrawer === 'merchant') && (
        <NpcOverlay
          mode={activeDrawer}
          save={save}
          onUpdateSave={updateSave}
          onClose={() => setActiveDrawer(null)}
        />
      )}

      {(shellState === 'paused' || shellState === 'gameover') && !activeDrawer && (
        <EndModal
          mode={shellState}
          endSnapshot={endSnapshot}
          deaths={save.deaths}
          onResume={() => setShellState('playing')}
          onRespawnAtBonfire={() => {
            engineRef.current?.restAtBonfire(true);
            setEndSnapshot(null);
            setShellState('playing');
          }}
          onOpenCharacter={() => {
            setShellState('playing');
            setActiveDrawer('character');
          }}
          onOpenSettings={() => setActiveDrawer('settings')}
          onReturnTitle={() => {
            persistSaveState(saveRef.current);
            setActiveDrawer(null);
            setEndSnapshot(null);
            setShellState('title');
          }}
        />
      )}

      {activeDrawer === 'settings' && (
        <SettingsModal
          settings={settings}
          onChange={updateSettings}
          onClose={() => setActiveDrawer(null)}
        />
      )}
    </div>
  );
}
