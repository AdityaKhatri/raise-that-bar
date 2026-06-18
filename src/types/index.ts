// ─── View Routing ────────────────────────────────────────────────────────────
export type ViewId = 'today' | 'plan' | 'workouts' | 'library' | 'profile' | 'progress' | 'editor' | 'analyze';

// ─── Exercises ───────────────────────────────────────────────────────────────
export type EquipmentType =
  | 'bodyweight' | 'barbell' | 'dumbbell' | 'cable'
  | 'machine' | 'kettlebell' | 'band' | 'other';

export type CategoryType =
  | 'warmup' | 'stretching' | 'muscle' | 'cardio' | 'cooldown'
  | 'yoga' | 'meditation' | 'breathing';

export type DefaultUnit = 'kg' | 'lb' | 'sec' | 'min' | null;

export interface Exercise {
  id: string;
  name: string;
  muscleGroup: string;
  secondaryMuscles: string[];
  equipment: EquipmentType;
  category: CategoryType;
  videoUrl: string | null;
  defaultUnit: DefaultUnit;
  source: 'library' | 'custom';
  archived: boolean;
  updatedAt: number;
}

// ─── Workout Templates ────────────────────────────────────────────────────────
export type GroupType =
  | 'warmup' | 'mobility' | 'activation' | 'main'
  | 'accessory' | 'cardio' | 'cooldown';

export interface WorkoutBlock {
  id: string;
  exerciseId: string;
  targetSets: number | null;
  targetReps: string | null;
  targetWeight: number | null;
  targetTime: number | null;
  targetDistance: number | null;
  restSec: number | null;
  notes: string;
}

export interface WorkoutGroup {
  id: string;
  name: string;
  groupType: GroupType;
  blocks: WorkoutBlock[];
}

export interface Workout {
  id: string;
  name: string;
  notes: string;
  groups: WorkoutGroup[];
  archived: boolean;
  updatedAt: number;
}

// ─── Plan ─────────────────────────────────────────────────────────────────────
export interface PlanDayWorkout {
  workoutId: string;
  note: string;
}

export interface PlanDay {
  date: string;       // "2026-04-30" ISO
  workouts: PlanDayWorkout[];
  notes: string;
  updatedAt: number;
}

// ─── Sessions ─────────────────────────────────────────────────────────────────
export interface SessionSet {
  completed: boolean;
  weight: number | null;
  reps: number | null;
  time: number | null;
  distance: number | null;
  rpe: number | null;
  notes: string;
}

export interface SessionBlock {
  id: string;
  exerciseId: string;
  exerciseName: string;
  skipped: boolean;
  skipReason: string;
  sets: SessionSet[];
}

export interface SessionGroup {
  id: string;
  name: string;
  groupType: string;
  blocks: SessionBlock[];
}

export interface Session {
  id: string;
  date: string;
  startedAt: number;
  finishedAt: number | null;
  durationMs: number | null;
  workoutId: string | null;
  workoutName: string;
  unplanned: boolean;
  groups: SessionGroup[];
  notes: string;
  updatedAt: number;
}

// ─── Bodyweight ───────────────────────────────────────────────────────────────
export interface Bodyweight {
  date: string;
  weight: number;
  unit: 'kg' | 'lb';
  notes: string;
  updatedAt: number;
}

// ─── User Profile ─────────────────────────────────────────────────────────────
/** Legacy shape stored in meta store — kept for migration only */
export interface UserProfile {
  name: string;
  dateOfBirth: string | null;
  heightCm: number | null;
  goalWeight: number | null;
  unit: 'kg' | 'lb';
}

/** Canonical profile record — stored in dedicated 'profile' IDB store */
export interface ProfileRecord {
  id: 'profile';
  name: string;
  dateOfBirth: string | null;   // "YYYY-MM-DD"
  heightCm: number | null;
  sex: 'male' | 'female' | null;
  activityLevel: number | null; // 1.2 | 1.375 | 1.55 | 1.725 | 1.9
  unit: 'kg' | 'lb';
  goalWeight: number | null;
  updatedAt: number;
}

// ─── Nutrition ────────────────────────────────────────────────────────────────
export type MealCategory = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'misc';

export interface NutritionLog {
  id: string;              // 'nl_<timestamp>'
  date: string;            // "YYYY-MM-DD"
  name: string;            // "Dal Bhat"
  category: MealCategory;
  kcal: number;
  protein?: number;        // grams
  carbs?: number;          // grams
  time?: string;           // "HH:MM" — optional meal time
  notes: string;
  aiDescription?: string;  // raw description entered for AI estimation
  createdAt: string;       // ISO datetime
}

export interface CalorieGoalLog {
  id: string;                    // 'cg_<timestamp>'
  date: string;                  // "YYYY-MM-DD" — date goal was set
  targetCalories: number;
  calculatedMaintenance: number; // TDEE at time of setting
  weightAtTime: number;          // snapshot from bodyweight log
  note: string;
}

// ─── Meta ─────────────────────────────────────────────────────────────────────
export interface MetaRecord {
  key: string;
  value: unknown;
}

export interface Preferences {
  unit: 'kg' | 'lb';
  restTimerSound: boolean;
  theme: 'system' | 'light' | 'dark';
}

// ─── CSV / Library ────────────────────────────────────────────────────────────
export interface ExerciseFilters {
  search?: string;
  category?: CategoryType | '';
  muscleGroup?: string;
  equipment?: EquipmentType | '';
  showArchived?: boolean;
}
