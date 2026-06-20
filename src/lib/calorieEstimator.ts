import { getAllBodyweight } from '../db/bodyweight';
import type { Session, SessionGroup } from '../types';

const GROUP_MET: Record<string, number> = {
  warmup:     3.5,
  activation: 3.5,
  main:       5.0,
  accessory:  5.0,
  cardio:     7.0,
  mobility:   2.5,
  cooldown:   2.0,
};

const CARDIO_MET_OVERRIDES: Array<{ keywords: string[]; met: number }> = [
  { keywords: ['walk', 'walking'],          met: 3.5 },
  { keywords: ['run', 'running', 'jog'],    met: 9.0 },
  { keywords: ['bike', 'cycling', 'cycle'], met: 7.5 },
  { keywords: ['swim', 'swimming'],         met: 8.0 },
  { keywords: ['hike', 'hiking'],           met: 5.3 },
  { keywords: ['row', 'rowing'],            met: 7.0 },
  { keywords: ['jump rope', 'skipping'],    met: 10.0 },
  { keywords: ['elliptical'],               met: 5.0 },
  { keywords: ['stair', 'stairs'],          met: 9.0 },
];

function getMet(group: SessionGroup): number {
  const base = GROUP_MET[group.groupType] ?? 4.0;
  if (group.groupType !== 'cardio') return base;

  for (const block of group.blocks) {
    const name = block.exerciseName.toLowerCase();
    for (const override of CARDIO_MET_OVERRIDES) {
      if (override.keywords.some(k => name.includes(k))) return override.met;
    }
  }
  return base;
}

function effectiveDurationHours(session: Session): number {
  const sessionSec = session.durationMs != null ? session.durationMs / 1000 : 0;

  let maxSetTimeSec = 0;
  for (const group of session.groups) {
    for (const block of group.blocks) {
      for (const set of block.sets) {
        if (set.completed && set.time != null && set.time > maxSetTimeSec) {
          maxSetTimeSec = set.time;
        }
      }
    }
  }

  return Math.max(sessionSec, maxSetTimeSec) / 3600;
}

export function estimateSessionKcal(
  session: Session,
  weightKg: number | null,
): number | null {
  if (!weightKg || weightKg <= 0) return null;

  const totalHours = effectiveDurationHours(session);
  if (totalHours <= 0) return null;

  const groups = session.groups.filter(g => g.blocks.length > 0);
  if (groups.length === 0) return null;

  const hoursPerGroup = totalHours / groups.length;

  const total = groups.reduce((sum, group) => {
    return sum + getMet(group) * weightKg * hoursPerGroup;
  }, 0);

  return Math.round(total);
}

export async function estimateWithBodyweight(session: Session): Promise<number | null> {
  const bwEntries = await getAllBodyweight();
  const latestBw = bwEntries.length > 0
    ? bwEntries.sort((a, b) => b.date.localeCompare(a.date))[0]
    : null;
  const weightKg = latestBw
    ? (latestBw.unit === 'lb' ? latestBw.weight * 0.453592 : latestBw.weight)
    : null;
  return estimateSessionKcal(session, weightKg);
}
