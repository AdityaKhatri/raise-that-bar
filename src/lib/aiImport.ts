import { uid } from './ids';
import type { Workout, Exercise, GroupType } from '../types';

// ─── Library section ──────────────────────────────────────────────────────────

/**
 * Build a compact exercise library listing to embed directly in the prompt.
 * Format per line: name|muscleGroup|equipment|category
 * The AI uses the exact name when referencing exercises.
 */
function buildLibrarySection(exercises: Exercise[]): string {
  const lines = exercises
    .filter(e => !e.archived)
    .map(e => `${e.name}|${e.muscleGroup}|${e.equipment}|${e.category}`)
    .join('\n');

  return `## Exercise Library
Columns: name | muscle group | equipment | category
You MUST use exercise names exactly as written below (copy-paste, no paraphrasing):

${lines}`;
}

// ─── Shared strict rules ──────────────────────────────────────────────────────

const STRICT_RULES = `## Strict rules — follow exactly or the import will break

### Exercise names
- Every "name" field in your JSON MUST be copied character-for-character from the library above.
- Do NOT paraphrase, abbreviate, translate, or add/remove words (e.g. "Bench Press" ≠ "Dumbbell Bench Press").
- If you want an exercise that isn't in the library, pick the closest one that IS listed.
- Never invent an exercise name that doesn't appear in the library.

### Field types
- "sets": integer (e.g. 3)
- "reps": always a quoted string ("10", "8-12", "AMRAP") — NEVER a bare number — or omit entirely for timed exercises
- "time": integer seconds (e.g. 30) — only for timed exercises; omit for rep-based ones
- "rest": integer seconds (e.g. 90), or omit if not applicable
- "notes": string, use "" if empty — do not omit the field

### Group type — must be exactly one of:
warmup | mobility | activation | main | accessory | cardio | cooldown

### JSON validity
- Output valid JSON only — no trailing commas, no comments, no ellipsis, no placeholder text.
- No text before the opening \`\`\`json fence or after the closing \`\`\` fence.

### Pre-output checklist
Before writing the JSON, verify every exercise name against the library list above.
If any name doesn't match exactly, replace it with one that does.`;

// ─── Single workout prompt ────────────────────────────────────────────────────

export function buildSinglePrompt(exercises: Exercise[]): string {
  return `You are a workout planning assistant for IronLog, a workout tracking app.

${buildLibrarySection(exercises)}

${STRICT_RULES}

## Output format
When the user approves the workout, output ONLY the following JSON block — no text before or after it:

\`\`\`json
{
  "name": "Workout Name",
  "notes": "optional description",
  "groups": [
    {
      "name": "Group display name",
      "type": "main",
      "exercises": [
        {
          "name": "Exercise Name",
          "sets": 3,
          "reps": "8-12",
          "rest": 90,
          "notes": ""
        }
      ]
    }
  ]
}
\`\`\`

## Conversation flow
1. Ask the user about their goals, available equipment, experience level, and target muscles
2. Propose a workout using only exercises from the library
3. Refine based on feedback
4. When the user confirms, run the pre-output checklist, then output the JSON block and nothing else`.trim();
}

// ─── Week plan prompt ─────────────────────────────────────────────────────────

export function buildPlanPrompt(days: number, exercises: Exercise[]): string {
  return `You are a workout planning assistant for IronLog, a workout tracking app. The user wants a ${days}-day weekly workout plan.

${buildLibrarySection(exercises)}

${STRICT_RULES}

## Output format
When the user approves the plan, output ONLY the following JSON block — no text before or after it.
The "workouts" array must contain exactly ${days} items:

\`\`\`json
{
  "workouts": [
    {
      "name": "Day 1 — Push",
      "notes": "optional",
      "groups": [
        {
          "name": "Group display name",
          "type": "main",
          "exercises": [
            {
              "name": "Exercise Name",
              "sets": 3,
              "reps": "8-12",
              "rest": 90,
              "notes": ""
            }
          ]
        }
      ]
    }
  ]
}
\`\`\`

Name each workout clearly (e.g. "Push", "Pull", "Legs", "Upper", "Lower", "Full Body").

## Conversation flow
1. Ask the user about their goals, available equipment, experience level, and training style (Push/Pull/Legs, Upper/Lower, Full Body, etc.)
2. Design a balanced ${days}-day split using only exercises from the library
3. Ensure adequate muscle group recovery between sessions
4. Refine based on feedback
5. When the user confirms, run the pre-output checklist, then output the JSON block and nothing else`.trim();
}

// ─── Parser ───────────────────────────────────────────────────────────────────

interface AIExercise {
  name: string;
  sets?: number | null;
  reps?: string | null;
  time?: number | null;
  rest?: number | null;
  notes?: string;
}

interface AIGroup {
  name: string;
  type?: string;
  exercises: AIExercise[];
}

interface AIWorkout {
  name: string;
  notes?: string;
  groups: AIGroup[];
}

/**
 * Extract and parse JSON from an AI response (handles ```json ... ``` blocks).
 * Always returns an array — handles both single workout and multi-workout formats.
 */
export function parseAIResponse(text: string): AIWorkout[] {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = codeBlock ? codeBlock[1].trim() : text.trim();
  const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

  // Multi-workout: { workouts: [...] }
  if (Array.isArray(parsed.workouts)) {
    const workouts = parsed.workouts as AIWorkout[];
    workouts.forEach((w, i) => {
      if (!w.name || !Array.isArray(w.groups))
        throw new Error(`Workout ${i + 1} is missing "name" or "groups"`);
    });
    return workouts;
  }

  // Single workout: { name, groups, ... }
  const single = parsed as unknown as AIWorkout;
  if (!single.name || !Array.isArray(single.groups))
    throw new Error('Missing required fields: name, groups (or workouts array for a plan)');
  return [single];
}

// ─── Name → ID resolution ────────────────────────────────────────────────────

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

export interface AIResolvedExercise {
  aiName: string;
  exercise: Exercise | null;
  sets: number;
  reps: string | null;
  time: number | null;
  rest: number | null;
  notes: string;
}

export interface AIResolvedGroup {
  name: string;
  groupType: GroupType;
  exercises: AIResolvedExercise[];
}

export interface AIResolveResult {
  workoutName: string;
  workoutNotes: string;
  groups: AIResolvedGroup[];
  missingCount: number;
}

const VALID_GROUP_TYPES = new Set<GroupType>([
  'warmup', 'mobility', 'activation', 'main', 'accessory', 'cardio', 'cooldown',
]);

function buildLookups(library: Exercise[]) {
  return {
    byId: new Map(library.map(e => [e.id, e])),
    byExactName: new Map(library.map(e => [e.name.toLowerCase(), e])),
    byNorm: new Map(library.map(e => [normalize(e.name), e])),
  };
}

function resolveExerciseName(
  name: string,
  lookups: ReturnType<typeof buildLookups>,
): Exercise | null {
  const { byId, byExactName, byNorm } = lookups;
  if (byId.has(name)) return byId.get(name)!;
  const lower = name.toLowerCase();
  if (byExactName.has(lower)) return byExactName.get(lower)!;
  const norm = normalize(name);
  if (byNorm.has(norm)) return byNorm.get(norm)!;
  const words = norm.split(' ').filter(Boolean);
  for (const [key, ex] of byNorm) {
    if (words.every(w => key.includes(w))) return ex;
  }
  return null;
}

export function resolveAIWorkouts(workouts: AIWorkout[], library: Exercise[]): AIResolveResult[] {
  const lookups = buildLookups(library);
  return workouts.map(parsed => {
    let missingCount = 0;
    const groups: AIResolvedGroup[] = parsed.groups.map(g => ({
      name: g.name || 'Group',
      groupType: VALID_GROUP_TYPES.has(g.type as GroupType) ? g.type as GroupType : 'main',
      exercises: g.exercises.map(ex => {
        const exercise = resolveExerciseName(ex.name, lookups);
        if (!exercise) missingCount++;
        return {
          aiName: ex.name,
          exercise,
          sets: ex.sets ?? 3,
          reps: ex.reps ?? null,
          time: ex.time ?? null,
          rest: ex.rest ?? null,
          notes: ex.notes ?? '',
        };
      }),
    }));
    return { workoutName: parsed.name, workoutNotes: parsed.notes ?? '', groups, missingCount };
  });
}

// ─── Build Workout records ────────────────────────────────────────────────────

export function buildWorkoutsFromAI(results: AIResolveResult[]): Workout[] {
  const now = Date.now();
  return results.map(resolved => ({
    id: uid('w'),
    name: resolved.workoutName,
    notes: resolved.workoutNotes,
    archived: false,
    updatedAt: now,
    groups: resolved.groups.map(g => ({
      id: uid('g'),
      name: g.name,
      groupType: g.groupType,
      blocks: g.exercises
        .filter(ex => ex.exercise !== null)
        .map(ex => ({
          id: uid('b'),
          exerciseId: ex.exercise!.id,
          targetSets: ex.sets,
          targetReps: ex.reps,
          targetWeight: null,
          targetTime: ex.time,
          targetDistance: null,
          restSec: ex.rest,
          notes: ex.notes,
        })),
    })),
  }));
}
