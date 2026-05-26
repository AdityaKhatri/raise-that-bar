import type { Exercise, Workout, WorkoutBlock, WorkoutGroup } from '../types';
import { getAllExercises, putExercise } from '../db/exercises';
import { putWorkout } from '../db/workouts';
import { uid } from './ids';

// ─── Payload types (v1) ───────────────────────────────────────────────────────

export interface SharePayloadBlock {
  exerciseId: string;
  targetSets: number | null;
  targetReps: string | null;
  targetWeight: number | null;
  targetTime: number | null;
  targetDistance: number | null;
  restSec: number | null;
  notes: string;
}

export interface SharePayloadGroup {
  name: string;
  groupType: string;
  blocks: SharePayloadBlock[];
}

// Only custom exercises are inlined — library exercises are resolved by id.
export interface SharePayloadCustomExercise {
  id: string;
  name: string;
  muscleGroup: string;
  secondaryMuscles: string[];
  equipment: string;
  category: string;
  defaultUnit: string | null;
}

export interface SharePayload {
  v: 1;
  workout: {
    name: string;
    notes: string;
    groups: SharePayloadGroup[];
  };
  customExercises?: SharePayloadCustomExercise[];
}

// ─── Compression + base64url ──────────────────────────────────────────────────

async function compress(text: string): Promise<Uint8Array> {
  const stream = new CompressionStream('gzip');
  const writer = stream.writable.getWriter();
  writer.write(new TextEncoder().encode(text));
  writer.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

async function decompress(bytes: Uint8Array): Promise<string> {
  const stream = new DecompressionStream('gzip');
  const writer = stream.writable.getWriter();
  writer.write(bytes.buffer as ArrayBuffer);
  writer.close();
  return new Response(stream.readable).text();
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function fromBase64Url(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (padded.length % 4)) % 4;
  const bin = atob(padded + '='.repeat(padding));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

export async function encodeWorkoutPayload(payload: SharePayload): Promise<string> {
  const compressed = await compress(JSON.stringify(payload));
  return toBase64Url(compressed);
}

export async function decodeWorkoutPayload(encoded: string): Promise<SharePayload> {
  const bytes = fromBase64Url(encoded);
  const json = await decompress(bytes);
  const payload = JSON.parse(json) as SharePayload;
  if (payload.v !== 1) throw new Error(`Unsupported payload version: ${payload.v}`);
  return payload;
}

// ─── Build payload from a local Workout ──────────────────────────────────────

export async function buildSharePayload(workout: Workout): Promise<SharePayload> {
  const allExercises = await getAllExercises();
  const exerciseById = new Map(allExercises.map(e => [e.id, e]));
  const exerciseByName = new Map(allExercises.map(e => [e.name.toLowerCase(), e]));

  // Resolve exerciseId: if it's a legacy name-based id, find the real exercise by name.
  // Also heal the workout in the DB so it doesn't need fixing again.
  function resolveId(rawId: string): string {
    if (exerciseById.has(rawId)) return rawId;
    const byName = exerciseByName.get(rawId.toLowerCase());
    return byName ? byName.id : rawId;
  }

  // Check if any block needs fixing and persist the corrected workout
  const needsHeal = workout.groups.some(g =>
    g.blocks.some(b => !exerciseById.has(b.exerciseId) && exerciseByName.has(b.exerciseId.toLowerCase()))
  );
  if (needsHeal) {
    const healed: Workout = {
      ...workout,
      groups: workout.groups.map(g => ({
        ...g,
        blocks: g.blocks.map(b => ({ ...b, exerciseId: resolveId(b.exerciseId) })),
      })),
      updatedAt: Date.now(),
    };
    await putWorkout(healed);
    workout = healed;
  }

  // Inline definitions only for custom exercises referenced by this workout
  const customExercises: SharePayloadCustomExercise[] = [];
  for (const group of workout.groups) {
    for (const block of group.blocks) {
      const ex = exerciseById.get(block.exerciseId);
      if (ex?.source === 'custom' && !customExercises.find(c => c.id === ex.id)) {
        customExercises.push({
          id: ex.id,
          name: ex.name,
          muscleGroup: ex.muscleGroup,
          secondaryMuscles: ex.secondaryMuscles,
          equipment: ex.equipment,
          category: ex.category,
          defaultUnit: ex.defaultUnit,
        });
      }
    }
  }

  return {
    v: 1,
    workout: {
      name: workout.name,
      notes: workout.notes,
      groups: workout.groups.map(g => ({
        name: g.name,
        groupType: g.groupType,
        blocks: g.blocks.map(b => ({
          exerciseId: b.exerciseId,
          targetSets: b.targetSets,
          targetReps: b.targetReps,
          targetWeight: b.targetWeight,
          targetTime: b.targetTime,
          targetDistance: b.targetDistance,
          restSec: b.restSec,
          notes: b.notes,
        })),
      })),
    },
    ...(customExercises.length > 0 ? { customExercises } : {}),
  };
}

// ─── Import ───────────────────────────────────────────────────────────────────

export interface ImportPreview {
  workoutName: string;
  groups: Array<{
    name: string;
    groupType: string;
    exercises: Array<{ id: string; name: string; found: boolean }>;
  }>;
  skippedIds: string[]; // exerciseIds not found locally and not inlined
}

/** Analyse a payload without writing anything — used to show the confirmation sheet. */
export async function previewImport(payload: SharePayload): Promise<ImportPreview> {
  const allExercises = await getAllExercises();
  const exerciseMap = new Map(allExercises.map(e => [e.id, e]));
  const customMap = new Map((payload.customExercises ?? []).map(c => [c.id, c]));

  const skippedIds: string[] = [];
  const groups = payload.workout.groups.map(pg => ({
    name: pg.name,
    groupType: pg.groupType,
    exercises: pg.blocks.map(pb => {
      const local = exerciseMap.get(pb.exerciseId);
      const inlined = customMap.get(pb.exerciseId);
      const name = local?.name ?? inlined?.name ?? pb.exerciseId;
      const found = !!(local || inlined);
      if (!found) skippedIds.push(pb.exerciseId);
      return { id: pb.exerciseId, name, found };
    }),
  }));

  return { workoutName: payload.workout.name, groups, skippedIds };
}

export interface ImportResult {
  workout: Workout;
  /** Names of custom exercises that were added to the local library. */
  importedCustomExercises: string[];
  /** Exercise IDs that were not found and had to be dropped. */
  skippedIds: string[];
}

/** Write the workout (and any inlined custom exercises) to IndexedDB. */
export async function importWorkoutFromPayload(payload: SharePayload): Promise<ImportResult> {
  const allExercises = await getAllExercises();
  const exerciseMap = new Map(allExercises.map(e => [e.id, e]));

  // Merge inlined custom exercises that don't already exist locally
  const importedCustomExercises: string[] = [];
  for (const ce of payload.customExercises ?? []) {
    if (!exerciseMap.has(ce.id)) {
      const exercise: Exercise = {
        id: ce.id,
        name: ce.name,
        muscleGroup: ce.muscleGroup,
        secondaryMuscles: ce.secondaryMuscles,
        equipment: ce.equipment as Exercise['equipment'],
        category: ce.category as Exercise['category'],
        videoUrl: null,
        defaultUnit: ce.defaultUnit as Exercise['defaultUnit'],
        source: 'custom',
        archived: false,
        updatedAt: Date.now(),
      };
      await putExercise(exercise);
      exerciseMap.set(ce.id, exercise);
      importedCustomExercises.push(ce.name);
    }
  }

  // Build groups, skipping blocks whose exercise can't be resolved
  const skippedIds: string[] = [];
  const groups: WorkoutGroup[] = [];

  for (const pg of payload.workout.groups) {
    const blocks: WorkoutBlock[] = [];
    for (const pb of pg.blocks) {
      if (exerciseMap.has(pb.exerciseId)) {
        blocks.push({
          id: uid('b'),
          exerciseId: pb.exerciseId,
          targetSets: pb.targetSets,
          targetReps: pb.targetReps,
          targetWeight: pb.targetWeight,
          targetTime: pb.targetTime,
          targetDistance: pb.targetDistance,
          restSec: pb.restSec,
          notes: pb.notes,
        });
      } else {
        skippedIds.push(pb.exerciseId);
      }
    }
    if (blocks.length > 0) {
      groups.push({
        id: uid('g'),
        name: pg.name,
        groupType: pg.groupType as WorkoutGroup['groupType'],
        blocks,
      });
    }
  }

  const workout: Workout = {
    id: uid('w'),
    name: payload.workout.name,
    notes: payload.workout.notes,
    groups,
    archived: false,
    updatedAt: Date.now(),
  };

  await putWorkout(workout);
  return { workout, importedCustomExercises, skippedIds };
}

// ─── URL helpers ──────────────────────────────────────────────────────────────

export function buildShareUrl(encoded: string): string {
  const base = `${window.location.origin}${import.meta.env.BASE_URL}`;
  // Strip trailing slash before adding fragment so URL is clean
  return `${base.replace(/\/$/, '')}/#import=${encoded}`;
}

export function extractImportFragment(): string | null {
  const hash = window.location.hash;
  if (!hash.startsWith('#import=')) return null;
  return hash.slice('#import='.length) || null;
}

export function clearImportFragment(): void {
  history.replaceState(null, '', window.location.pathname + window.location.search);
}
