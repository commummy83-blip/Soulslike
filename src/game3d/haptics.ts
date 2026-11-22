export interface VibrationPulse {
  delayMs: number;
  duration: number;
  strongMagnitude: number;
  weakMagnitude: number;
}

export const POISE_BREAK_VIBRATION_PATTERN: readonly VibrationPulse[] = [
  {
    delayMs: 0,
    duration: 140,
    strongMagnitude: 0.95,
    weakMagnitude: 0.65,
  },
  {
    delayMs: 170,
    duration: 110,
    strongMagnitude: 0.45,
    weakMagnitude: 0.8,
  },
];

type HapticActuatorLike = {
  playEffect?: (
    type: 'dual-rumble',
    params?: {
      startDelay?: number;
      duration?: number;
      weakMagnitude?: number;
      strongMagnitude?: number;
    }
  ) => Promise<unknown>;
  pulse?: (value: number, duration: number) => Promise<unknown>;
};

type GamepadLike = {
  vibrationActuator?: HapticActuatorLike | null;
  hapticActuators?: ArrayLike<HapticActuatorLike>;
};

export class ControllerHaptics {
  private pendingTimers = new Set<ReturnType<typeof setTimeout>>();

  private playPulseOnGamepad(pad: GamepadLike, pulse: VibrationPulse): void {
    const actuator = pad.vibrationActuator ?? pad.hapticActuators?.[0];
    if (!actuator) return;
    try {
      if (typeof actuator.playEffect === 'function') {
        void Promise.resolve(
          actuator.playEffect('dual-rumble', {
            startDelay: 0,
            duration: pulse.duration,
            weakMagnitude: pulse.weakMagnitude,
            strongMagnitude: pulse.strongMagnitude,
          })
        ).catch(() => {});
      } else if (typeof actuator.pulse === 'function') {
        void Promise.resolve(
          actuator.pulse(pulse.strongMagnitude, pulse.duration)
        ).catch(() => {});
      }
    } catch {
      // Ignore unsupported controller haptic errors
    }
  }

  public triggerPoiseBreak(
    getGamepads: () => ArrayLike<GamepadLike | null> = () =>
      typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function'
        ? navigator.getGamepads()
        : []
  ): boolean {
    let triggered = false;
    const pads = getGamepads();

    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      if (!pad || (!pad.vibrationActuator && !pad.hapticActuators?.length)) continue;
      triggered = true;

      for (const pulse of POISE_BREAK_VIBRATION_PATTERN) {
        if (pulse.delayMs <= 0) {
          this.playPulseOnGamepad(pad, pulse);
        } else {
          const timer = setTimeout(() => {
            this.pendingTimers.delete(timer);
            const latestPad = getGamepads()[i] ?? pad;
            if (latestPad) {
              this.playPulseOnGamepad(latestPad, pulse);
            }
          }, pulse.delayMs);
          this.pendingTimers.add(timer);
        }
      }
    }

    // Mobile / Android browser tactile fallback when Vibration API is available
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate([140, 30, 110]);
      } catch {
        // Ignore browser vibrate permission restrictions
      }
    }

    return triggered;
  }

  public dispose(): void {
    for (const timer of this.pendingTimers) {
      clearTimeout(timer);
    }
    this.pendingTimers.clear();
  }
}
