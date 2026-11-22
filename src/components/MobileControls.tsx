import { useRef, useState } from 'react';
import { Crosshair, Flame, FlaskConical, Shield, Sword, Wind } from 'lucide-react';
import { computeAnalogStickOutput } from '../game/virtualStick';
import type { LiveHudSnapshot } from '../game/types';
import type { VirtualInputState } from '../game3d/GameEngine';

interface MobileControlsProps {
  hud: LiveHudSnapshot;
  virtualInputRef: React.MutableRefObject<VirtualInputState | null>;
}

export function MobileControls({ hud, virtualInputRef }: MobileControlsProps) {
  const stickOriginRef = useRef<{
    pointerId: number;
    cx: number;
    cy: number;
    maxRadius: number;
  } | null>(null);
  const knobRef = useRef<HTMLDivElement | null>(null);
  const lookOriginRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
  } | null>(null);

  const [stickState, setStickState] = useState<'idle' | 'walk' | 'sprint'>('idle');
  const [guardHeld, setGuardHeld] = useState(false);

  const resetStick = () => {
    stickOriginRef.current = null;
    setStickState('idle');
    if (virtualInputRef.current) {
      virtualInputRef.current.moveX = 0;
      virtualInputRef.current.moveY = 0;
      virtualInputRef.current.sprintHeld = false;
    }
    if (knobRef.current) {
      knobRef.current.style.transform = 'translate(0px, 0px)';
    }
  };

  const updateStickFromPointer = (clientX: number, clientY: number) => {
    const origin = stickOriginRef.current;
    if (!origin) return;
    const out = computeAnalogStickOutput(
      clientX - origin.cx,
      clientY - origin.cy,
      origin.maxRadius
    );
    if (virtualInputRef.current) {
      virtualInputRef.current.moveX = out.moveX;
      virtualInputRef.current.moveY = out.moveY;
      virtualInputRef.current.sprintHeld = out.isSprinting;
    }
    if (knobRef.current) {
      knobRef.current.style.transform = `translate(${out.knobX.toFixed(1)}px, ${out.knobY.toFixed(1)}px)`;
    }
    const nextState = out.isSprinting ? 'sprint' : out.isActive ? 'walk' : 'idle';
    setStickState((prev) => (prev === nextState ? prev : nextState));
  };

  return (
    <div
      data-testid="mobile-controls"
      className="fixed inset-0 z-10 pointer-events-none select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Right-half touch camera look pad */}
      <div
        data-testid="mobile-camera-pad"
        className="absolute top-16 right-0 bottom-40 left-[42%] pointer-events-auto touch-none"
        onPointerDown={(e) => {
          if (lookOriginRef.current) return;
          lookOriginRef.current = {
            pointerId: e.pointerId,
            x: e.clientX,
            y: e.clientY,
          };
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!lookOriginRef.current || lookOriginRef.current.pointerId !== e.pointerId) return;
          if (virtualInputRef.current) {
            virtualInputRef.current.lookDeltaX += e.clientX - lookOriginRef.current.x;
            virtualInputRef.current.lookDeltaY += e.clientY - lookOriginRef.current.y;
          }
          lookOriginRef.current.x = e.clientX;
          lookOriginRef.current.y = e.clientY;
        }}
        onPointerUp={(e) => {
          if (lookOriginRef.current?.pointerId === e.pointerId) {
            lookOriginRef.current = null;
          }
        }}
        onPointerCancel={(e) => {
          if (lookOriginRef.current?.pointerId === e.pointerId) {
            lookOriginRef.current = null;
          }
        }}
      />

      {/* Bottom-Left Onscreen Analog Thumbstick */}
      <div
        data-testid="mobile-analog-stick"
        data-active={stickState !== 'idle' ? '1' : '0'}
        data-sprinting={stickState === 'sprint' ? '1' : '0'}
        aria-label="Movement Analog Stick"
        className={`absolute bottom-5 left-4 sm:bottom-7 sm:left-6 [@media(max-height:500px)]:bottom-3 [@media(max-height:500px)]:left-4 w-[116px] h-[116px] sm:w-[128px] sm:h-[128px] [@media(max-height:500px)]:w-[96px] [@media(max-height:500px)]:h-[96px] rounded-full bg-[#120f0d]/78 border-2 pointer-events-auto touch-none flex items-center justify-center transition-colors ${
          stickState === 'sprint'
            ? 'border-[#e5a95e] shadow-[0_0_18px_rgba(229,169,94,0.45)]'
            : stickState === 'walk'
              ? 'border-[#b58b4c] shadow-[0_6px_20px_rgba(0,0,0,0.85)]'
              : 'border-[#7d623c] shadow-[0_6px_18px_rgba(0,0,0,0.8)]'
        }`}
        onPointerDown={(e) => {
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          stickOriginRef.current = {
            pointerId: e.pointerId,
            cx: rect.left + rect.width / 2,
            cy: rect.top + rect.height / 2,
            maxRadius: Math.max(28, rect.width * 0.36),
          };
          e.currentTarget.setPointerCapture?.(e.pointerId);
          updateStickFromPointer(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (!stickOriginRef.current || stickOriginRef.current.pointerId !== e.pointerId) return;
          updateStickFromPointer(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          if (stickOriginRef.current?.pointerId === e.pointerId) {
            resetStick();
          }
        }}
        onPointerCancel={(e) => {
          if (stickOriginRef.current?.pointerId === e.pointerId) {
            resetStick();
          }
        }}
      >
        {/* Cardinal guide ticks & deadzone inner ring */}
        <div
          className="absolute inset-2.5 rounded-full border border-dashed border-[#6b5537]/45 pointer-events-none"
          aria-hidden="true"
        />
        <div
          className="absolute w-9 h-9 rounded-full border border-[#5c482f]/50 pointer-events-none"
          aria-hidden="true"
        />
        {stickState === 'sprint' && (
          <span
            className="absolute -top-5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-[#1a140d]/90 border border-[#e5a95e]/80 text-[8px] font-bold uppercase tracking-[0.16em] text-[#ffd796] pointer-events-none"
            aria-hidden="true"
          >
            Sprint
          </span>
        )}

        {/* Tactile Analog Thumb Knob */}
        <div
          ref={knobRef}
          data-testid="mobile-analog-knob"
          className={`w-11 h-11 [@media(max-height:500px)]:w-9 [@media(max-height:500px)]:h-9 rounded-full border-2 flex items-center justify-center pointer-events-none shadow-[0_4px_12px_rgba(0,0,0,0.9)] ${
            stickState === 'sprint'
              ? 'bg-[#c98b3a] border-[#ffe1a8]'
              : 'bg-[#2a2219]/95 border-[#c99b56]'
          }`}
        >
          <span className="w-2.5 h-2.5 rotate-45 bg-[#f5dfb3]/85 border border-[#6e522b]" />
        </div>
      </div>

      {/* Bottom-Right Ergonomic Combat Action Cluster */}
      <div
        data-testid="mobile-action-cluster"
        className="absolute bottom-5 right-4 sm:bottom-7 sm:right-6 [@media(max-height:500px)]:bottom-3 [@media(max-height:500px)]:right-4 grid grid-cols-3 items-end gap-2 [@media(max-height:500px)]:gap-1.5 pointer-events-auto touch-none"
      >
        <button
          type="button"
          aria-label="Toggle Lock-On"
          onPointerDown={(e) => {
            e.stopPropagation();
            if (virtualInputRef.current) virtualInputRef.current.lockOnPressed = true;
          }}
          className={`w-12 h-12 [@media(max-height:500px)]:w-10 [@media(max-height:500px)]:h-10 rounded-full border flex flex-col items-center justify-center gap-0.5 touch-none cursor-pointer ${
            hud.lockedTarget
              ? 'bg-[#2e2314]/95 border-[#e5b35a] text-[#ffe1a6]'
              : 'bg-[#171310]/90 border-[#735c3e] text-[#e3d4bc]'
          }`}
        >
          <Crosshair className="w-3.5 h-3.5" />
          <span className="text-[9px] font-bold uppercase tracking-wider leading-none">Lock</span>
        </button>

        <button
          type="button"
          aria-label="Use Sanctum Flask"
          onPointerDown={(e) => {
            e.stopPropagation();
            if (virtualInputRef.current) virtualInputRef.current.estusPressed = true;
          }}
          className={`relative w-12 h-12 [@media(max-height:500px)]:w-10 [@media(max-height:500px)]:h-10 rounded-full border flex flex-col items-center justify-center gap-0.5 touch-none cursor-pointer ${
            hud.estusCharges > 0
              ? 'bg-[#2b1b0f]/92 border-[#d18232] text-[#ffd399]'
              : 'bg-[#181412]/80 border-[#4d3e31] text-[#857766]'
          }`}
        >
          <FlaskConical className="w-3.5 h-3.5" />
          <span className="text-[9px] font-bold uppercase tracking-wider leading-none">
            Flask
          </span>
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#120f0c] border border-[#b5843f] text-[9px] font-bold tabular-nums text-[#f5dfb3] flex items-center justify-center">
            {hud.estusCharges}
          </span>
        </button>

        <button
          type="button"
          aria-label="Heavy Attack"
          onPointerDown={(e) => {
            e.stopPropagation();
            if (virtualInputRef.current) virtualInputRef.current.heavyPressed = true;
          }}
          className="w-12 h-12 [@media(max-height:500px)]:w-10 [@media(max-height:500px)]:h-10 rounded-full bg-[#2e1414]/92 active:bg-[#4a1e1e] border border-[#b8463e] text-[#f7c5bf] flex flex-col items-center justify-center gap-0.5 touch-none cursor-pointer"
        >
          <Flame className="w-3.5 h-3.5" />
          <span className="text-[9px] font-bold uppercase tracking-wider leading-none">Heavy</span>
        </button>

        <button
          type="button"
          aria-label="Guard and Parry"
          onPointerDown={(e) => {
            e.stopPropagation();
            setGuardHeld(true);
            if (virtualInputRef.current) virtualInputRef.current.blockHeld = true;
            e.currentTarget.setPointerCapture?.(e.pointerId);
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
            setGuardHeld(false);
            if (virtualInputRef.current) virtualInputRef.current.blockHeld = false;
          }}
          onPointerCancel={(e) => {
            e.stopPropagation();
            setGuardHeld(false);
            if (virtualInputRef.current) virtualInputRef.current.blockHeld = false;
          }}
          className={`w-12 h-12 [@media(max-height:500px)]:w-10 [@media(max-height:500px)]:h-10 rounded-full border flex flex-col items-center justify-center gap-0.5 touch-none cursor-pointer ${
            guardHeld
              ? 'bg-[#242c38]/95 border-[#93b4e0] text-[#e2edff]'
              : 'bg-[#171412]/90 border-[#7d7d85] text-[#d8dce3]'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          <span className="text-[9px] font-bold uppercase tracking-wider leading-none">Guard</span>
        </button>

        <button
          type="button"
          aria-label="Dodge Roll"
          onPointerDown={(e) => {
            e.stopPropagation();
            if (virtualInputRef.current) virtualInputRef.current.dodgePressed = true;
          }}
          className="w-12 h-12 [@media(max-height:500px)]:w-10 [@media(max-height:500px)]:h-10 rounded-full bg-[#171d16]/92 active:bg-[#273324] border border-[#68875b] text-[#c4e0b8] flex flex-col items-center justify-center gap-0.5 touch-none cursor-pointer"
        >
          <Wind className="w-3.5 h-3.5" />
          <span className="text-[9px] font-bold uppercase tracking-wider leading-none">Roll</span>
        </button>

        <button
          type="button"
          aria-label="Light Attack"
          onPointerDown={(e) => {
            e.stopPropagation();
            if (virtualInputRef.current) virtualInputRef.current.lightPressed = true;
          }}
          className="w-14 h-14 [@media(max-height:500px)]:w-12 [@media(max-height:500px)]:h-12 rounded-full bg-[#332215]/95 active:bg-[#4d331f] border-2 border-[#d4a359] text-[#f7e3bd] flex flex-col items-center justify-center gap-0.5 touch-none shadow-[0_4px_14px_rgba(0,0,0,0.85)] cursor-pointer"
        >
          <Sword className="w-4 h-4" />
          <span className="text-[10px] font-bold uppercase tracking-wider leading-none">Atk</span>
        </button>
      </div>

      {/* Contextual Interact Tap Button (Positioned cleanly above Boss Bar / Analog Deck) */}
      {hud.interactionPrompt && (
        <button
          type="button"
          data-testid="mobile-interact-button"
          onPointerDown={(e) => {
            e.stopPropagation();
            if (virtualInputRef.current) virtualInputRef.current.interactPressed = true;
          }}
          className={`fixed left-1/2 -translate-x-1/2 px-4 py-2 bg-[#1a1510]/95 active:bg-[#2d2419] border border-[#c99c57] text-center pointer-events-auto touch-none shadow-[0_6px_18px_rgba(0,0,0,0.9)] cursor-pointer ${
            hud.bossTarget
              ? 'bottom-[248px] [@media(max-height:500px)]:bottom-[82px]'
              : 'bottom-[168px] [@media(max-height:500px)]:bottom-[24px]'
          }`}
        >
          <div className="text-xs font-bold tracking-[0.14em] uppercase text-[#f5dfb3]">
            Tap: {hud.interactionPrompt.label}
          </div>
          <div className="text-[10px] text-[#b0a089]">{hud.interactionPrompt.sublabel}</div>
        </button>
      )}
    </div>
  );
}
