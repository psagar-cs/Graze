import { useAuth } from '@clerk/clerk-expo';
import { useEffect, useState } from 'react';

import { buildDefaultServingLabel, roundInventoryAmount } from '../lib/inventory';
import { configureSupabaseAccessToken } from '../lib/supabase';
import {
  archivePantryItem,
  createFoodLog,
  createPantryItem,
  ensureProfile,
  getPantryItems,
  getTodayLogs,
  updatePantryStock,
  updatePantryStocks,
  updatePantryItem,
  updateProfileTargets,
} from '../services/graze';
import type {
  FoodLogEntry,
  FoodLogFormValues,
  PantryFormValues,
  PantryItem,
  Profile,
  Suggestion,
  TodaySummary,
} from '../types';

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));
type LoadStep = 'profile' | 'pantry' | 'todayLogs';

const stepLabels: Record<LoadStep, string> = {
  profile: 'profile',
  pantry: 'pantry items',
  todayLogs: "today's logs",
};

const getErrorParts = (value: unknown) => {
  if (value instanceof Error) {
    return {
      message: value.message,
      details: '',
      hint: '',
      code: '',
    };
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;

    return {
      message: typeof record.message === 'string' ? record.message : '',
      details: typeof record.details === 'string' ? record.details : '',
      hint: typeof record.hint === 'string' ? record.hint : '',
      code: typeof record.code === 'string' ? record.code : '',
    };
  }

  return {
    message: '',
    details: '',
    hint: '',
    code: '',
  };
};

const formatPantrySaveError = (saveError: unknown) => {
  const { message, details, hint, code } = getErrorParts(saveError);
  const normalizedMessage = [message, details, hint, code].join(' ').toLowerCase();

  if (!normalizedMessage.trim()) {
    return 'Unable to save pantry item.';
  }

  if (
    normalizedMessage.includes('category')
    || normalizedMessage.includes('effort_level')
    || normalizedMessage.includes('meal_role')
  ) {
    return 'Pantry save failed because the v2 pantry metadata migration has not been run.';
  }

  const detailParts = [message, details, hint ? `Hint: ${hint}` : '', code ? `Code: ${code}` : ''].filter(Boolean);

  return detailParts.join(' ');
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
  servingAmount: '1',
  servingUnit: 'serving',
  stockEntryMode: 'amount',
  stockAmount: '',
  stockServings: '',
  caloriesPerServing: '',
  proteinPerServing: '',
  quantityLabel: '',
  category: 'other',
  effortLevel: 'assemble',
  mealRole: 'main',
});

const emptyFoodLogForm = (): FoodLogFormValues => ({
  pantryItemId: null,
  customName: '',
  servings: '1',
  amountUsed: '',
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
      default_serving: buildDefaultServingLabel(Number(values.servingAmount), values.servingUnit),
      serving_amount: Number(values.servingAmount),
      serving_unit: values.servingUnit,
      stock_amount:
        values.stockEntryMode === 'amount'
          ? roundInventoryAmount(Number(values.stockAmount))
          : roundInventoryAmount(Number(values.stockServings) * Number(values.servingAmount)),
      calories_per_serving: Number(values.caloriesPerServing),
      protein_per_serving: Number(values.proteinPerServing),
      quantity_label: values.quantityLabel.trim() || 'In stock',
      category: values.category,
      effort_level: values.effortLevel,
      meal_role: values.mealRole,
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
      console.error('Graze pantry save failed:', saveError);
      const message = formatPantrySaveError(saveError);
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

  const clearPantryStock = async (item: PantryItem) => {
    setSubmitting(true);
    setError(null);

    try {
      const savedItem = await updatePantryStock(item.id, 0);

      setPantryItems((current) =>
        current.map((entry) => (entry.id === savedItem.id ? savedItem : entry)),
      );
    } catch (clearError) {
      const message = clearError instanceof Error ? clearError.message : 'Unable to clear pantry stock.';
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
      let nextPantryItem: PantryItem | null = null;
      let amountUsed = 0;

      if (values.pantryItemId) {
        nextPantryItem = pantryItems.find((item) => item.id === values.pantryItemId) ?? null;

        if (!nextPantryItem) {
          throw new Error('Could not find that pantry item to deduct inventory.');
        }

        amountUsed = values.amountUsed.trim()
          ? Number(values.amountUsed)
          : Number(values.servings) * nextPantryItem.serving_amount;

        if (!Number.isFinite(amountUsed) || amountUsed <= 0) {
          throw new Error('Enter a valid pantry amount used.');
        }

        if (amountUsed - nextPantryItem.stock_amount > 0.0001) {
          throw new Error(`Not enough ${nextPantryItem.name} in stock for that log.`);
        }
      }

      const savedEntry = await createFoodLog(userId, {
        pantry_item_id: values.pantryItemId,
        custom_name: values.pantryItemId ? null : values.customName.trim(),
        servings: Number(values.servings),
        calories: Math.round(Number(values.calories)),
        protein: Math.round(Number(values.protein)),
        notes: values.notes.trim() || null,
      });

      if (!savedEntry) {
        throw new Error('Unable to log food.');
      }

      if (nextPantryItem) {
        const updatedItem = await updatePantryStock(
          nextPantryItem.id,
          Math.max(0, roundInventoryAmount(nextPantryItem.stock_amount - amountUsed)),
        );

        setPantryItems((current) =>
          current.map((item) => (item.id === updatedItem.id ? updatedItem : item)),
        );
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

  const saveSuggestedMealLog = async (suggestion: Suggestion, mealServings: string) => {
    if (!userId) {
      return;
    }

    const scaledMealServings = Number(mealServings);

    if (!Number.isFinite(scaledMealServings) || scaledMealServings <= 0) {
      throw new Error('Enter a valid number of meal servings.');
    }

    setSubmitting(true);
    setError(null);

    try {
      const pantryUpdates = suggestion.ingredientDetails.map((ingredient) => {
        const pantryItem = pantryItems.find((item) => item.id === ingredient.pantryItemId);

        if (!pantryItem) {
          throw new Error(`Could not find ${ingredient.name} in the pantry.`);
        }

        const stockAmountRequired = roundInventoryAmount(ingredient.stockAmountRequired * scaledMealServings);

        if (stockAmountRequired - pantryItem.stock_amount > 0.0001) {
          throw new Error(`Not enough ${ingredient.name} in stock for that meal.`);
        }

        return {
          id: pantryItem.id,
          stock_amount: Math.max(0, roundInventoryAmount(pantryItem.stock_amount - stockAmountRequired)),
        };
      });

      const savedEntry = await createFoodLog(userId, {
        pantry_item_id: null,
        custom_name: suggestion.title,
        servings: scaledMealServings,
        calories: Math.round(suggestion.estimatedCalories * scaledMealServings),
        protein: Math.round(suggestion.estimatedProtein * scaledMealServings),
        notes: null,
      });

      if (!savedEntry) {
        throw new Error('Unable to log meal.');
      }

      const updatedItems = await updatePantryStocks(pantryUpdates);

      setPantryItems((current) =>
        current.map((item) => updatedItems.find((updatedItem) => updatedItem.id === item.id) ?? item),
      );
      setTodayLogs((current) => [savedEntry, ...current]);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Unable to log meal.';
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
    saveSuggestedMealLog,
    savePantryItem,
    saveTargets,
    submitting,
    todayLogs,
    todaySummary: buildTodaySummary(profile, todayLogs),
    clearPantryStock,
    togglePantryItem,
    emptyFoodLogForm,
    emptyPantryForm,
  };
};
