import { useAuth } from '@clerk/clerk-expo';
import { useEffect, useState } from 'react';

import { configureSupabaseAccessToken } from '../lib/supabase';
import {
  archivePantryItem,
  createFoodLog,
  createPantryItem,
  ensureProfile,
  getPantryItems,
  getTodayLogs,
  updatePantryItem,
  updateProfileTargets,
} from '../services/graze';
import type { FoodLogEntry, FoodLogFormValues, PantryFormValues, PantryItem, Profile, TodaySummary } from '../types';

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));
type LoadStep = 'profile' | 'pantry' | 'todayLogs';

const stepLabels: Record<LoadStep, string> = {
  profile: 'profile',
  pantry: 'pantry items',
  todayLogs: "today's logs",
};

const formatLoadError = (step: LoadStep, loadError: unknown) => {
  const fallback = `Could not load ${stepLabels[step]}.`;

  if (loadError instanceof Error && loadError.message) {
    return `${fallback} ${loadError.message}`;
  }

  return fallback;
};

export const buildTodaySummary = (
  profile: Profile | null,
  logs: FoodLogEntry[],
): TodaySummary => {
  const consumedCalories = logs.reduce((sum, entry) => sum + entry.calories, 0);
  const consumedProtein = logs.reduce((sum, entry) => sum + entry.protein, 0);
  const calorieTarget = profile?.daily_calorie_target ?? 0;
  const proteinTarget = profile?.daily_protein_target ?? 0;

  return {
    consumedCalories,
    consumedProtein,
    remainingCalories: Math.max(calorieTarget - consumedCalories, 0),
    remainingProtein: Math.max(proteinTarget - consumedProtein, 0),
    percentCalories: calorieTarget ? clampPercent((consumedCalories / calorieTarget) * 100) : 0,
    percentProtein: proteinTarget ? clampPercent((consumedProtein / proteinTarget) * 100) : 0,
  };
};

const emptyPantryForm = (): PantryFormValues => ({
  name: '',
  defaultServing: '',
  caloriesPerServing: '',
  proteinPerServing: '',
  quantityLabel: '',
});

const emptyFoodLogForm = (): FoodLogFormValues => ({
  pantryItemId: null,
  customName: '',
  servings: '1',
  calories: '',
  protein: '',
  notes: '',
});

export const useGrazeData = () => {
  const { getToken, userId } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [todayLogs, setTodayLogs] = useState<FoodLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    configureSupabaseAccessToken(() => getToken());
  }, [getToken]);

  const refresh = async () => {
    if (!userId) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const ensuredProfile = await ensureProfile(userId);
      setProfile(ensuredProfile);

      try {
        const items = await getPantryItems(userId);
        setPantryItems(items);
      } catch (refreshError) {
        console.error('Graze refresh failed at pantry step:', refreshError);
        setPantryItems([]);
        setError(formatLoadError('pantry', refreshError));
      }

      try {
        const logs = await getTodayLogs(userId);
        setTodayLogs(logs);
      } catch (refreshError) {
        console.error('Graze refresh failed at todayLogs step:', refreshError);
        setTodayLogs([]);
        setError((current) => current ?? formatLoadError('todayLogs', refreshError));
      }
    } catch (refreshError) {
      console.error('Graze refresh failed at profile step:', refreshError);
      setProfile(null);
      setPantryItems([]);
      setTodayLogs([]);
      setError(formatLoadError('profile', refreshError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [userId]);

  const saveTargets = async (dailyCalorieTarget: string, dailyProteinTarget: string) => {
    if (!userId) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const updatedProfile = await updateProfileTargets(
        userId,
        Number(dailyCalorieTarget),
        Number(dailyProteinTarget),
      );

      setProfile(updatedProfile);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Unable to save targets.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const savePantryItem = async (values: PantryFormValues, editingItem?: PantryItem | null) => {
    if (!userId) {
      return;
    }

    setSubmitting(true);
    setError(null);

    const payload = {
      name: values.name.trim(),
      default_serving: values.defaultServing.trim(),
      calories_per_serving: Number(values.caloriesPerServing),
      protein_per_serving: Number(values.proteinPerServing),
      quantity_label: values.quantityLabel.trim() || 'In stock',
    };

    try {
      const savedItem = editingItem
        ? await updatePantryItem(editingItem.id, payload)
        : await createPantryItem(userId, payload);

      if (!savedItem) {
        throw new Error('Unable to save pantry item.');
      }

      setPantryItems((current) => {
        if (editingItem) {
          return current.map((item) => (item.id === savedItem.id ? savedItem : item));
        }

        return [savedItem, ...current];
      });
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Unable to save pantry item.';
      setError(message);
      throw saveError;
    } finally {
      setSubmitting(false);
    }
  };

  const togglePantryItem = async (item: PantryItem) => {
    setSubmitting(true);
    setError(null);

    try {
      const savedItem = await archivePantryItem(item.id, !item.is_active);

      if (!savedItem) {
        throw new Error('Unable to update pantry item.');
      }

      setPantryItems((current) =>
        current.map((entry) => (entry.id === savedItem.id ? savedItem : entry)),
      );
    } catch (toggleError) {
      const message = toggleError instanceof Error ? toggleError.message : 'Unable to update pantry item.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const saveFoodLog = async (values: FoodLogFormValues) => {
    if (!userId) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const savedEntry = await createFoodLog(userId, {
        pantry_item_id: values.pantryItemId,
        custom_name: values.pantryItemId ? null : values.customName.trim(),
        servings: Number(values.servings),
        calories: Number(values.calories),
        protein: Number(values.protein),
        notes: values.notes.trim() || null,
      });

      if (!savedEntry) {
        throw new Error('Unable to log food.');
      }

      setTodayLogs((current) => [savedEntry, ...current]);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Unable to log food.';
      setError(message);
      throw saveError;
    } finally {
      setSubmitting(false);
    }
  };

  return {
    error,
    loading,
    pantryItems,
    profile,
    refresh,
    saveFoodLog,
    savePantryItem,
    saveTargets,
    submitting,
    todayLogs,
    todaySummary: buildTodaySummary(profile, todayLogs),
    togglePantryItem,
    emptyFoodLogForm,
    emptyPantryForm,
  };
};
