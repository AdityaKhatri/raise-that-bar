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

function activeBlocks(group: SessionGroup) {
  return group.blocks.filter(b => !b.skipped);
}

function getMet(group: SessionGroup): number {
  const base = GROUP_MET[group.groupType] ?? 4.0;
  if (group.groupType !== 'cardio') return base;

  for (const block of activeBlocks(group)) {
    const name = block.exerciseName.toLowerCase();
    for (const override of CARDIO_MET_OVERRIDES) {
      if (override.keywords.some(k => name.includes(k))) return override.met;
    }
  }
  return base;
}

function groupTimedSeconds(group: SessionGroup): number {
  let sec = 0;
  for (const b of activeBlocks(group))
    for (const s of b.sets)
      if (s.completed && s.time != null) sec += s.time;
  return sec;
}

function groupCompletedUntimed(group: SessionGroup): number {
  let n = 0;
  for (const b of activeBlocks(group))
    for (const s of b.sets)
      if (s.completed && s.time == null) n++;
  return n;
}

export function estimateSessionKcal(
  session: Session,
  weightKg: number | null,
): number | null {
  if (!weightKg || weightKg <= 0) return null;

  const groups = session.groups.filter(g => activeBlocks(g).length > 0);
  if (groups.length === 0) return null;

  const sessionSec = session.durationMs != null ? session.durationMs / 1000 : 0;

  // Timed sets (cardio, stretching, etc.) use their logged time directly.
  // Remaining session time is split across untimed sets (strength) by count.
  const timedPerGroup = groups.map(g => groupTimedSeconds(g));
  const untimedPerGroup = groups.map(g => groupCompletedUntimed(g));
  const totalTimedSec = timedPerGroup.reduce((a, b) => a + b, 0);
  const totalUntimed = untimedPerGroup.reduce((a, b) => a + b, 0);

  const remainingSec = Math.max(sessionSec - totalTimedSec, 0);

  let total = 0;
  for (let i = 0; i < groups.length; i++) {
    const met = getMet(groups[i]);
    const timedHours = timedPerGroup[i] / 3600;
    const untimedHours = totalUntimed > 0
      ? (remainingSec * (untimedPerGroup[i] / totalUntimed)) / 3600
      : 0;
    total += met * weightKg * (timedHours + untimedHours);
  }

  if (total <= 0) return null;
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
