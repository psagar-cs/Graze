import { useAuth } from '@clerk/clerk-expo';
import { useEffect, useRef, useState } from 'react';

import { normalizeDateOnly } from '../lib/expiry';
import { buildDefaultServingLabel, roundInventoryAmount } from '../lib/inventory';
import { configureSupabaseAccessToken } from '../lib/supabase';
import {
  archivePantryItem,
  createCustomMeal,
  createFoodLog,
  createFoodLogMealItems,
  createPantryItem,
  deleteCustomMeal,
  deleteFoodLog,
  deleteFoodLogMealItems,
  ensureProfile,
  getCustomMeals,
  getFoodLogMealItems,
  getPantryItems,
  getTodayLogs,
  replaceFoodLogMealItems,
  updateCustomMeal,
  updateFoodLog,
  updateGroupedFoodLog,
  updatePantryStock,
  updatePantryStocks,
  updatePantryItem,
  updateProfileTargets,
} from '../services/graze';
import type {
  CustomMeal,
  FoodLogEntry,
  FoodLogFormValues,
  FoodLogMealItem,
  GroupedFoodLogFormValues,
  PantryFormValues,
  PantryItem,
  Profile,
  Suggestion,
  SuggestionIngredient,
  TodaySummary,
} from '../types';

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));
type LoadStep = 'profile' | 'pantry' | 'customMeals' | 'todayLogs';

const stepLabels: Record<LoadStep, string> = {
  profile: 'profile',
  pantry: 'pantry items',
  customMeals: 'custom meals',
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
    || normalizedMessage.includes('expires_on')
  ) {
    return 'Pantry save failed because the pantry metadata or expiry migrations have not been run.';
  }

  const detailParts = [message, details, hint ? `Hint: ${hint}` : '', code ? `Code: ${code}` : ''].filter(Boolean);

  return detailParts.join(' ');
};

const formatLoadError = (step: LoadStep, loadError: unknown) => {
  const fallback = `Could not load ${stepLabels[step]}.`;
  const { message, details, hint, code } = getErrorParts(loadError);

  const detailParts = [
    message,
    details,
    hint ? `Hint: ${hint}` : '',
    code ? `Code: ${code}` : '',
  ].filter(Boolean);

  if (detailParts.length > 0) {
    return `${fallback} ${detailParts.join(' ')}`;
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
  expiresOn: '',
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

const sortLogsNewestFirst = (entries: FoodLogEntry[]) =>
  [...entries].sort((left, right) => new Date(right.logged_at).getTime() - new Date(left.logged_at).getTime());

const isGroupedLogSource = (value: FoodLogEntry['log_source']) =>
  value === 'suggested_grouped' || value === 'custom_meal_grouped';

const isStructuredGroupedLog = (entry: FoodLogEntry, mealItems: FoodLogMealItem[]) =>
  isGroupedLogSource(entry.log_source) && mealItems.length > 0;

const calculateIngredientNutrition = (item: PantryItem, amountUsed: number) => {
  if (!Number.isFinite(item.serving_amount) || item.serving_amount <= 0) {
    return {
      calories: 0,
      protein: 0,
    };
  }

  const ratio = amountUsed / item.serving_amount;

  return {
    calories: Number((item.calories_per_serving * ratio).toFixed(2)),
    protein: Number((item.protein_per_serving * ratio).toFixed(2)),
  };
};

const syncPantryItemInMeals = (meals: CustomMeal[], updatedItem: PantryItem) =>
  meals.map((meal) => ({
    ...meal,
    ingredients: meal.ingredients.map((ingredient) =>
      ingredient.pantry_item_id === updatedItem.id
        ? {
            ...ingredient,
            pantry_item: updatedItem,
          }
        : ingredient),
  }));

const buildCustomMealCanonicalKey = (
  ingredients: {
    pantry_item_id: string;
  }[],
) =>
  ingredients
    .map((ingredient) => ingredient.pantry_item_id)
    .sort()
    .join('|');

export const useGrazeData = () => {
  const { getToken, isLoaded, isSignedIn, userId } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [customMeals, setCustomMeals] = useState<CustomMeal[]>([]);
  const [todayLogs, setTodayLogs] = useState<FoodLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const getTokenRef = useRef(getToken);
  const lastBootstrapKeyRef = useRef<string | null>(null);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const authStateKey = !isLoaded ? 'pending' : isSignedIn && userId ? `signed-in:${userId}` : 'signed-out';

  useEffect(() => {
    configureSupabaseAccessToken(async () => {
      if (!isLoaded || !isSignedIn) {
        return null;
      }

      return getTokenRef.current();
    });
  }, [isLoaded, isSignedIn]);

  const refresh = async (mode: 'bootstrap' | 'manual' = 'manual') => {
    if (!isLoaded) {
      return;
    }

    if (!isSignedIn || !userId) {
      lastBootstrapKeyRef.current = authStateKey;
      setProfile(null);
      setPantryItems([]);
      setCustomMeals([]);
      setTodayLogs([]);
      setError(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (mode === 'bootstrap' && lastBootstrapKeyRef.current === authStateKey) {
      return;
    }

    if (mode === 'bootstrap') {
      lastBootstrapKeyRef.current = authStateKey;
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    setError(null);

    try {
      const token = await getTokenRef.current();

      if (!token) {
        throw new Error('Authentication session is not ready yet.');
      }

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
        const meals = await getCustomMeals(userId);
        setCustomMeals(meals);
      } catch (refreshError) {
        console.error('Graze refresh failed at custom meals step:', refreshError);
        setCustomMeals([]);
        setError((current) => current ?? formatLoadError('customMeals', refreshError));
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
      setCustomMeals([]);
      setTodayLogs([]);
      setError(formatLoadError('profile', refreshError));
    } finally {
      if (mode === 'bootstrap') {
        setLoading(false);
      } else {
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    void refresh('bootstrap');
  }, [authStateKey, isLoaded, isSignedIn, userId]);

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

    const normalizedExpiry = values.expiresOn.trim()
      ? normalizeDateOnly(values.expiresOn)
      : null;

    if (values.expiresOn.trim() && !normalizedExpiry) {
      const invalidError = new Error('Enter expiry as YYYY-MM-DD or leave it blank.');
      setError(invalidError.message);
      throw invalidError;
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
      expires_on: normalizedExpiry,
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
      setCustomMeals((current) => syncPantryItemInMeals(current, savedItem));
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
      setCustomMeals((current) => syncPantryItemInMeals(current, savedItem));
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
      setCustomMeals((current) => syncPantryItemInMeals(current, savedItem));
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
        log_source: values.pantryItemId ? 'pantry_item' : 'custom',
        servings: Number(values.servings),
        pantry_amount_used: values.pantryItemId ? roundInventoryAmount(amountUsed) : null,
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
        setCustomMeals((current) => syncPantryItemInMeals(current, updatedItem));
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

  const createGroupedMealLog = async (
    logSource: 'suggested_grouped' | 'custom_meal_grouped',
    title: string,
    mealServings: string,
    ingredients: {
      pantryItemId: string;
      name: string;
      amountUsedPerMealServing: number;
      sortOrder: number;
    }[],
  ) => {
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
      const groupedIngredients = ingredients.map((ingredient) => {
        const pantryItem = pantryItems.find((item) => item.id === ingredient.pantryItemId);

        if (!pantryItem) {
          throw new Error(`Could not find ${ingredient.name} in the pantry.`);
        }

        if (!pantryItem.is_active) {
          throw new Error(`${ingredient.name} is archived. Update that meal before logging it.`);
        }

        const amountUsed = roundInventoryAmount(ingredient.amountUsedPerMealServing * scaledMealServings);

        if (amountUsed - pantryItem.stock_amount > 0.0001) {
          throw new Error(`Not enough ${ingredient.name} in stock for that meal.`);
        }

        const nutrition = calculateIngredientNutrition(pantryItem, amountUsed);

        return {
          pantryItem,
          ingredientName: ingredient.name,
          amountUsed,
          sortOrder: ingredient.sortOrder,
          calories: nutrition.calories,
          protein: nutrition.protein,
          id: pantryItem.id,
          stock_amount: Math.max(0, roundInventoryAmount(pantryItem.stock_amount - amountUsed)),
        };
      });

      const totalCalories = Math.round(groupedIngredients.reduce((sum, ingredient) => sum + ingredient.calories, 0));
      const totalProtein = Math.round(groupedIngredients.reduce((sum, ingredient) => sum + ingredient.protein, 0));

      const savedLog = await createFoodLog(userId, {
        pantry_item_id: null,
        custom_name: title,
        log_source: logSource,
        servings: scaledMealServings,
        pantry_amount_used: null,
        calories: totalCalories,
        protein: totalProtein,
        notes: null,
      });

      if (!savedLog) {
        throw new Error('Unable to log meal.');
      }

      const savedEntry = logSource === 'suggested_grouped'
        ? { ...savedLog, log_source: 'suggested_grouped' as const }
        : { ...savedLog, log_source: 'custom_meal_grouped' as const };

      await createFoodLogMealItems(
        groupedIngredients.map((ingredient) => ({
          user_id: userId,
          food_log_id: savedEntry.id,
          pantry_item_id: ingredient.pantryItem.id,
          ingredient_name: ingredient.ingredientName,
          amount_used: ingredient.amountUsed,
          calories: ingredient.calories,
          protein: ingredient.protein,
          sort_order: ingredient.sortOrder,
        })),
      );

      const updatedItems = await updatePantryStocks(
        groupedIngredients.map((ingredient) => ({
          id: ingredient.id,
          stock_amount: ingredient.stock_amount,
        })),
      );

      setPantryItems((current) =>
        current.map((item) => updatedItems.find((updatedItem) => updatedItem.id === item.id) ?? item),
      );
      setCustomMeals((current) =>
        updatedItems.reduce((nextMeals, updatedItem) => syncPantryItemInMeals(nextMeals, updatedItem), current),
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

  const saveSuggestedMealLog = async (suggestion: Suggestion, mealServings: string) =>
    createGroupedMealLog(
      'suggested_grouped',
      suggestion.title,
      mealServings,
      suggestion.ingredientDetails.map((ingredient: SuggestionIngredient, index) => ({
        pantryItemId: ingredient.pantryItemId,
        name: ingredient.name,
        amountUsedPerMealServing: ingredient.stockAmountRequired,
        sortOrder: index,
      })),
    );

  const saveCustomMeal = async (
    meal: {
      name: string;
      ingredients: {
        pantry_item_id: string;
        amount_used: number;
        sort_order: number;
      }[];
    },
    editingMeal?: CustomMeal | null,
  ) => {
    if (!userId) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const savedMeal = editingMeal
        ? await updateCustomMeal(editingMeal.id, userId, meal)
        : await createCustomMeal(userId, meal);

      setCustomMeals((current) => {
        if (editingMeal) {
          return current.map((entry) => (entry.id === savedMeal.id ? savedMeal : entry));
        }

        return [savedMeal, ...current];
      });
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Unable to save custom meal.';
      setError(message);
      throw saveError;
    } finally {
      setSubmitting(false);
    }
  };

  const saveSuggestionAsCustomMeal = async (suggestion: Suggestion) => {
    if (!userId) {
      return null;
    }

    const meal = {
      name: suggestion.title,
      ingredients: suggestion.ingredientDetails.map((ingredient, index) => ({
        pantry_item_id: ingredient.pantryItemId,
        amount_used: ingredient.stockAmountRequired,
        sort_order: index,
      })),
    };

    const mealCanonicalKey = buildCustomMealCanonicalKey(meal.ingredients);

    if (customMeals.some((existingMeal) => buildCustomMealCanonicalKey(existingMeal.ingredients) === mealCanonicalKey)) {
      throw new Error('That meal is already in your saved meals.');
    }

    return saveCustomMeal(meal);
  };

  const removeCustomMeal = async (meal: CustomMeal) => {
    setSubmitting(true);
    setError(null);

    try {
      await deleteCustomMeal(meal.id);
      setCustomMeals((current) => current.filter((entry) => entry.id !== meal.id));
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : 'Unable to delete custom meal.';
      setError(message);
      throw deleteError;
    } finally {
      setSubmitting(false);
    }
  };

  const logCustomMeal = async (meal: CustomMeal, mealServings: string) =>
    createGroupedMealLog(
      'custom_meal_grouped',
      meal.name,
      mealServings,
      meal.ingredients.map((ingredient) => ({
        pantryItemId: ingredient.pantry_item_id,
        name: ingredient.pantry_item?.name ?? 'Pantry ingredient',
        amountUsedPerMealServing: ingredient.amount_used,
        sortOrder: ingredient.sort_order,
      })),
    );

  const loadFoodLogMealItems = async (entryId: string) => {
    try {
      return await getFoodLogMealItems(entryId);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Unable to load meal details.';
      setError(message);
      throw loadError;
    }
  };

  const editGroupedFoodLog = async (
    entry: FoodLogEntry,
    values: GroupedFoodLogFormValues,
    existingMealItems: FoodLogMealItem[],
  ) => {
    if (!userId) {
      return [] as FoodLogMealItem[];
    }

    setSubmitting(true);
    setError(null);

    try {
      if (!isStructuredGroupedLog(entry, existingMealItems)) {
        throw new Error('This older grouped log does not have editable ingredient details.');
      }

      const nextMealServings = Number(values.mealServings);

      if (!values.title.trim()) {
        throw new Error('Give the grouped meal a name.');
      }

      if (!Number.isFinite(nextMealServings) || nextMealServings <= 0) {
        throw new Error('Enter a valid number of meal servings.');
      }

      if (!values.ingredients.length) {
        throw new Error('Add at least one pantry ingredient.');
      }

      const ingredientIds = values.ingredients.map((ingredient) => ingredient.pantryItemId).filter(Boolean);

      if (new Set(ingredientIds).size !== ingredientIds.length) {
        throw new Error('Use each pantry item only once in a grouped meal log.');
      }

      const previousRestoredStocks = new Map<string, number>();

      existingMealItems.forEach((ingredient) => {
        if (!ingredient.pantry_item_id) {
          return;
        }

        const pantryItem = pantryItems.find((item) => item.id === ingredient.pantry_item_id);

        if (!pantryItem) {
          return;
        }

        previousRestoredStocks.set(
          pantryItem.id,
          roundInventoryAmount((previousRestoredStocks.get(pantryItem.id) ?? pantryItem.stock_amount) + ingredient.amount_used),
        );
      });

      const nextIngredients = values.ingredients.map((ingredient, index) => {
        if (!ingredient.pantryItemId) {
          throw new Error('Choose a pantry item for each grouped ingredient row.');
        }

        const pantryItem = pantryItems.find((item) => item.id === ingredient.pantryItemId) ?? null;

        if (!pantryItem) {
          throw new Error('Could not find one of those pantry items.');
        }

        if (!pantryItem.is_active) {
          throw new Error(`${pantryItem.name} is archived. Replace it before saving this grouped meal.`);
        }

        const amountUsedPerServing = Number(ingredient.amountUsedPerServing);

        if (!Number.isFinite(amountUsedPerServing) || amountUsedPerServing <= 0) {
          throw new Error('Enter a valid positive amount for each grouped ingredient.');
        }

        const totalAmountUsed = roundInventoryAmount(amountUsedPerServing * nextMealServings);
        const restoredStockAmount = previousRestoredStocks.get(pantryItem.id) ?? pantryItem.stock_amount;

        if (totalAmountUsed - restoredStockAmount > 0.0001) {
          throw new Error(`Not enough ${pantryItem.name} in stock for that grouped meal correction.`);
        }

        const nutrition = calculateIngredientNutrition(pantryItem, totalAmountUsed);

        return {
          pantryItem,
          ingredientName: pantryItem.name,
          amountUsedPerServing,
          totalAmountUsed,
          sortOrder: index,
          calories: nutrition.calories,
          protein: nutrition.protein,
          stock_amount: Math.max(0, roundInventoryAmount(restoredStockAmount - totalAmountUsed)),
        };
      });

      const updatedItems = await updatePantryStocks(
        nextIngredients.map((ingredient) => ({
          id: ingredient.pantryItem.id,
          stock_amount: ingredient.stock_amount,
        })),
      );

      const totalCalories = Math.round(nextIngredients.reduce((sum, ingredient) => sum + ingredient.calories, 0));
      const totalProtein = Math.round(nextIngredients.reduce((sum, ingredient) => sum + ingredient.protein, 0));

      const savedEntry = await updateGroupedFoodLog(entry.id, {
        custom_name: values.title.trim(),
        servings: nextMealServings,
        calories: totalCalories,
        protein: totalProtein,
      });

      const savedMealItems = await replaceFoodLogMealItems(
        entry.id,
        nextIngredients.map((ingredient) => ({
          user_id: userId,
          pantry_item_id: ingredient.pantryItem.id,
          ingredient_name: ingredient.ingredientName,
          amount_used: ingredient.totalAmountUsed,
          calories: ingredient.calories,
          protein: ingredient.protein,
          sort_order: ingredient.sortOrder,
        })),
      );

      setPantryItems((current) =>
        current.map((item) => updatedItems.find((updatedItem) => updatedItem.id === item.id) ?? item),
      );
      setCustomMeals((current) =>
        updatedItems.reduce((nextMeals, updatedItem) => syncPantryItemInMeals(nextMeals, updatedItem), current),
      );
      setTodayLogs((current) => sortLogsNewestFirst(current.map((item) => (item.id === savedEntry.id ? savedEntry : item))));

      return savedMealItems;
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Unable to update grouped meal.';
      setError(message);
      throw saveError;
    } finally {
      setSubmitting(false);
    }
  };

  const removeGroupedFoodLog = async (entry: FoodLogEntry, existingMealItems: FoodLogMealItem[]) => {
    setSubmitting(true);
    setError(null);

    try {
      if (!isStructuredGroupedLog(entry, existingMealItems)) {
        throw new Error('This older grouped log does not have editable ingredient details.');
      }

      const restoreMap = new Map<string, number>();

      existingMealItems.forEach((ingredient) => {
        if (!ingredient.pantry_item_id) {
          return;
        }

        const pantryItem = pantryItems.find((item) => item.id === ingredient.pantry_item_id);

        if (!pantryItem) {
          return;
        }

        restoreMap.set(
          pantryItem.id,
          roundInventoryAmount((restoreMap.get(pantryItem.id) ?? pantryItem.stock_amount) + ingredient.amount_used),
        );
      });

      const updatedItems = await updatePantryStocks(
        Array.from(restoreMap.entries()).map(([id, stock_amount]) => ({
          id,
          stock_amount,
        })),
      );

      await deleteFoodLogMealItems(entry.id);
      await deleteFoodLog(entry.id);

      setPantryItems((current) =>
        current.map((item) => updatedItems.find((updatedItem) => updatedItem.id === item.id) ?? item),
      );
      setCustomMeals((current) =>
        updatedItems.reduce((nextMeals, updatedItem) => syncPantryItemInMeals(nextMeals, updatedItem), current),
      );
      setTodayLogs((current) => current.filter((item) => item.id !== entry.id));
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : 'Unable to delete grouped meal.';
      setError(message);
      throw deleteError;
    } finally {
      setSubmitting(false);
    }
  };

  const editFoodLog = async (entry: FoodLogEntry, values: FoodLogFormValues) => {
    setSubmitting(true);
    setError(null);

    try {
      if (isGroupedLogSource(entry.log_source)) {
        throw new Error('Grouped meal editing comes in a later phase.');
      }

      const nextServings = Number(values.servings);
      const nextCalories = Math.round(Number(values.calories));
      const nextProtein = Math.round(Number(values.protein));

      if (!Number.isFinite(nextServings) || nextServings <= 0) {
        throw new Error('Enter a valid number of servings.');
      }

      if (!Number.isFinite(nextCalories) || nextCalories < 0 || !Number.isFinite(nextProtein) || nextProtein < 0) {
        throw new Error('Enter valid calories and protein values.');
      }

      let updatedPantryItems: PantryItem[] | null = null;
      let nextPantryAmountUsed: number | null = null;

      if (entry.pantry_item_id) {
        const pantryItem = pantryItems.find((item) => item.id === entry.pantry_item_id) ?? null;

        if (!pantryItem) {
          throw new Error('Could not find that pantry item to correct inventory.');
        }

        const previousAmountUsed = roundInventoryAmount(entry.pantry_amount_used ?? (entry.servings * pantryItem.serving_amount));
        const requestedAmount = values.amountUsed.trim()
          ? Number(values.amountUsed)
          : nextServings * pantryItem.serving_amount;

        if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
          throw new Error('Enter a valid pantry amount used.');
        }

        const restoredStockAmount = roundInventoryAmount(pantryItem.stock_amount + previousAmountUsed);

        if (requestedAmount - restoredStockAmount > 0.0001) {
          throw new Error(`Not enough ${pantryItem.name} in stock for that correction.`);
        }

        const updatedItem = await updatePantryStock(
          pantryItem.id,
          Math.max(0, roundInventoryAmount(restoredStockAmount - requestedAmount)),
        );

        updatedPantryItems = pantryItems.map((item) => (item.id === updatedItem.id ? updatedItem : item));
        nextPantryAmountUsed = roundInventoryAmount(requestedAmount);
        setCustomMeals((current) => syncPantryItemInMeals(current, updatedItem));
      }

      const savedEntry = await updateFoodLog(entry.id, {
        custom_name: entry.pantry_item_id ? null : values.customName.trim(),
        servings: nextServings,
        pantry_amount_used: nextPantryAmountUsed,
        calories: nextCalories,
        protein: nextProtein,
        notes: values.notes.trim() || null,
      });

      if (updatedPantryItems) {
        setPantryItems(updatedPantryItems);
      }

      setTodayLogs((current) => sortLogsNewestFirst(current.map((item) => (item.id === savedEntry.id ? savedEntry : item))));
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Unable to update log.';
      setError(message);
      throw saveError;
    } finally {
      setSubmitting(false);
    }
  };

  const removeFoodLog = async (entry: FoodLogEntry) => {
    setSubmitting(true);
    setError(null);

    try {
      if (isGroupedLogSource(entry.log_source)) {
        throw new Error('Grouped meal editing comes in a later phase.');
      }

      if (entry.pantry_item_id) {
        const pantryItem = pantryItems.find((item) => item.id === entry.pantry_item_id) ?? null;

        if (!pantryItem) {
          throw new Error('Could not find that pantry item to restore inventory.');
        }

        const amountToRestore = roundInventoryAmount(entry.pantry_amount_used ?? (entry.servings * pantryItem.serving_amount));
        const updatedItem = await updatePantryStock(
          pantryItem.id,
          roundInventoryAmount(pantryItem.stock_amount + amountToRestore),
        );

        setPantryItems((current) =>
          current.map((item) => (item.id === updatedItem.id ? updatedItem : item)),
        );
        setCustomMeals((current) => syncPantryItemInMeals(current, updatedItem));
      }

      await deleteFoodLog(entry.id);
      setTodayLogs((current) => current.filter((item) => item.id !== entry.id));
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : 'Unable to delete log.';
      setError(message);
      throw deleteError;
    } finally {
      setSubmitting(false);
    }
  };

  return {
    error,
    loading,
    pantryItems,
    customMeals,
    profile,
    refresh,
    refreshing,
    editFoodLog,
    editGroupedFoodLog,
    loadFoodLogMealItems,
    logCustomMeal,
    removeFoodLog,
    removeGroupedFoodLog,
    removeCustomMeal,
    saveFoodLog,
    saveCustomMeal,
    saveSuggestionAsCustomMeal,
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
