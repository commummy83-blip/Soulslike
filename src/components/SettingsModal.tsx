import { Sliders, X } from 'lucide-react';
import { soundEngine } from '../game/audio';
import type { GameSettings } from '../game/types';

interface SettingsModalProps {
  settings: GameSettings;
  onChange: (next: GameSettings) => void;
  onClose: () => void;
}

export function SettingsModal({ settings, onChange, onClose }: SettingsModalProps) {
  const update = (patch: Partial<GameSettings>) => {
    onChange({ ...settings, ...patch });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#090807]/86 p-4">
      <div
        role="dialog"
        aria-label="Settings and Controls"
        className="w-full max-w-lg max-h-[88vh] flex flex-col bg-[#14110f] border border-[#8c6e43] shadow-[0_24px_60px_rgba(0,0,0,0.95)]"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#4d3e2b] bg-[#1a1612]">
          <div className="flex items-center gap-2.5">
            <Sliders className="w-4 h-4 text-[#c79d58]" />
            <h2 className="font-display text-lg tracking-[0.16em] text-[#f2d6a2] uppercase">
              Settings & Controls
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close Settings"
            onClick={onClose}
            className="p-2 bg-[#1e1915] hover:bg-[#2c251f] border border-[#614e36] text-[#dfd1ba] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto dark-scroll p-5 flex flex-col gap-4 text-sm">
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="vol-range" className="text-[#dfd1ba]">
              Master Volume ({Math.round(settings.masterVolume * 100)}%)
            </label>
            <input
              id="vol-range"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.masterVolume}
              onChange={(e) => update({ masterVolume: Number(e.target.value) })}
              className="w-44 accent-[#c79d58]"
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <label htmlFor="sens-range" className="text-[#dfd1ba]">
              Camera Sensitivity ({settings.cameraSensitivity.toFixed(1)}x)
            </label>
            <input
              id="sens-range"
              type="range"
              min={0.4}
              max={2.2}
              step={0.1}
              value={settings.cameraSensitivity}
              onChange={(e) => update({ cameraSensitivity: Number(e.target.value) })}
              className="w-44 accent-[#c79d58]"
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <label htmlFor="gfx-select" className="text-[#dfd1ba]">
              Graphics Quality
            </label>
            <select
              id="gfx-select"
              value={settings.graphicsQuality}
              onChange={(e) =>
                update({ graphicsQuality: e.target.value as GameSettings['graphicsQuality'] })
              }
              className="px-3 py-1.5 bg-[#1b1713] border border-[#614e36] text-[#f0e1c6]"
            >
              <option value="low">Low (Mobile / Battery)</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>

          <div className="flex items-center justify-between gap-4">
            <label htmlFor="ctrl-select" className="text-[#dfd1ba]">
              Input Mode (Desktop / Touch)
            </label>
            <select
              id="ctrl-select"
              value={settings.controlScheme}
              onChange={(e) =>
                update({ controlScheme: e.target.value as GameSettings['controlScheme'] })
              }
              className="px-3 py-1.5 bg-[#1b1713] border border-[#614e36] text-[#f0e1c6]"
            >
              <option value="auto">Auto-Detect</option>
              <option value="desktop">Desktop (Keyboard / Gamepad)</option>
              <option value="touch">On-Screen Touch Joystick</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <label htmlFor="weather-chk" className="text-[#dfd1ba]">
              Dynamic Weather & Ash Drift
            </label>
            <input
              id="weather-chk"
              type="checkbox"
              checked={settings.weatherEnabled}
              onChange={(e) => update({ weatherEnabled: e.target.checked })}
              className="w-4 h-4 accent-[#c79d58]"
            />
          </div>

          <div className="flex items-center justify-between">
            <label htmlFor="invert-chk" className="text-[#dfd1ba]">
              Invert Camera Y-Axis
            </label>
            <input
              id="invert-chk"
              type="checkbox"
              checked={settings.invertY}
              onChange={(e) => update({ invertY: e.target.checked })}
              className="w-4 h-4 accent-[#c79d58]"
            />
          </div>

          <div className="p-3.5 bg-[#191512] border border-[#3e3223] text-xs text-[#a89a84] flex flex-col gap-1.5">
            <div className="uppercase tracking-[0.14em] text-[#c79d58] font-semibold mb-0.5">
              Supported Control Schemes
            </div>
            <div>
              <strong>Keyboard & Mouse:</strong> WASD Move · LMB/J Light · Shift+LMB/K Heavy ·
              RMB/L Guard & Parry · Space Roll · Q Lock-On · F Flask · E Interact · Tab Journal
            </div>
            <div>
              <strong>Gamepad:</strong> Left Stick Move · Right Stick Camera · RB/X Light · RT Heavy
              · LB/LT Guard · B Roll · Y Flask · A Interact · R3 Lock-On
            </div>
            <div>
              <strong>Touchscreen (Android/Mobile):</strong> Virtual Thumbstick + Touch Action Cluster
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-[#4d3e2b] bg-[#1a1612] flex justify-end">
          <button
            type="button"
            onClick={() => {
              soundEngine.uiClick();
              onClose();
            }}
            className="px-5 py-2 text-xs uppercase tracking-[0.15em] bg-[#2a2117] hover:bg-[#3a2d1f] border border-[#b58b4c] text-[#f5dfb3] cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
