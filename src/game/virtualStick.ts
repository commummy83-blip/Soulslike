export const ANALOG_DEADZONE = 0.14;
export const ANALOG_SPRINT_THRESHOLD = 0.88;

export interface AnalogStickSample {
  moveX: number;
  moveY: number;
  knobX: number;
  knobY: number;
  magnitude: number;
  isActive: boolean;
  isSprinting: boolean;
}

export function computeAnalogStickOutput(
  dx: number,
  dy: number,
  maxRadius: number,
  deadzone: number = ANALOG_DEADZONE,
  sprintThreshold: number = ANALOG_SPRINT_THRESHOLD
): AnalogStickSample {
  const safeRadius = Math.max(1, maxRadius);
  const safeDeadzone = Math.max(0, Math.min(0.9, deadzone));
  const dist = Math.hypot(dx, dy);

  if (dist <= 0.0001) {
    return {
      moveX: 0,
      moveY: 0,
      knobX: 0,
      knobY: 0,
      magnitude: 0,
      isActive: false,
      isSprinting: false,
    };
  }

  const clampedDist = Math.min(safeRadius, dist);
  const dirX = dx / dist;
  const dirY = dy / dist;
  const knobX = dirX * clampedDist;
  const knobY = dirY * clampedDist;
  const rawRatio = clampedDist / safeRadius;

  if (rawRatio <= safeDeadzone) {
    return {
      moveX: 0,
      moveY: 0,
      knobX,
      knobY,
      magnitude: 0,
      isActive: false,
      isSprinting: false,
    };
  }

  const magnitude = Math.min(1, (rawRatio - safeDeadzone) / (1 - safeDeadzone));
  return {
    moveX: dirX * magnitude,
    moveY: dirY * magnitude,
    knobX,
    knobY,
    magnitude,
    isActive: true,
    isSprinting: rawRatio >= sprintThreshold,
  };
}
