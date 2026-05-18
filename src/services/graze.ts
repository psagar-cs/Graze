import { supabase } from '../lib/supabase';
import { getTodayRange } from '../lib/dates';
import type {
  CustomMeal,
  CustomMealIngredient,
  FoodLogEntry,
  FoodLogMealItem,
  FoodLogSource,
  PantryItem,
  Profile,
} from '../types';

const profileDefaults = {
  daily_calorie_target: 3000,
  daily_protein_target: 180,
};

const requireData = <T>(data: T | null, error: Error | null) => {
  if (error) {
    throw error;
  }

  return data;
};

const pantryMetadataDefaults = {
  category: 'other',
  effort_level: 'assemble',
  meal_role: 'main',
  serving_amount: 1,
  serving_unit: 'serving',
  stock_amount: 0,
} as const;

const normalizePantryItem = (item: Partial<PantryItem> | null | undefined): PantryItem | null => {
  if (!item) {
    return null;
  }

  return {
    ...item,
    category: item.category ?? pantryMetadataDefaults.category,
    effort_level: item.effort_level ?? pantryMetadataDefaults.effort_level,
    meal_role: item.meal_role ?? pantryMetadataDefaults.meal_role,
    serving_amount: item.serving_amount ?? pantryMetadataDefaults.serving_amount,
    serving_unit: item.serving_unit ?? pantryMetadataDefaults.serving_unit,
    stock_amount: item.stock_amount ?? pantryMetadataDefaults.stock_amount,
  } as PantryItem;
};

const normalizeFoodLogEntry = (entry: FoodLogEntry): FoodLogEntry => ({
  ...entry,
  log_source: entry.log_source ?? (entry.pantry_item_id ? 'pantry_item' : 'custom'),
  pantry_amount_used: typeof entry.pantry_amount_used === 'number' ? entry.pantry_amount_used : null,
  pantry_item: normalizePantryItem(entry.pantry_item),
});

const normalizeCustomMealIngredient = (
  ingredient: Partial<CustomMealIngredient> | null | undefined,
): CustomMealIngredient | null => {
  if (!ingredient) {
    return null;
  }

  return {
    ...ingredient,
    amount_used: ingredient.amount_used ?? 0,
    sort_order: ingredient.sort_order ?? 0,
    pantry_item: normalizePantryItem(ingredient.pantry_item),
  } as CustomMealIngredient;
};

const normalizeCustomMeal = (meal: Partial<CustomMeal> | null | undefined): CustomMeal | null => {
  if (!meal) {
    return null;
  }

  const ingredients = (meal.ingredients ?? [])
    .map((ingredient) => normalizeCustomMealIngredient(ingredient as CustomMealIngredient))
    .filter(Boolean) as CustomMealIngredient[];

  return {
    ...meal,
    ingredients: ingredients.sort((left, right) => left.sort_order - right.sort_order),
  } as CustomMeal;
};

const normalizeFoodLogMealItem = (
  item: Partial<FoodLogMealItem> | null | undefined,
): FoodLogMealItem | null => {
  if (!item) {
    return null;
  }

  return {
    ...item,
    amount_used: item.amount_used ?? 0,
    calories: item.calories ?? 0,
    protein: item.protein ?? 0,
    sort_order: item.sort_order ?? 0,
    pantry_item: normalizePantryItem(item.pantry_item),
  } as FoodLogMealItem;
};

const getCustomMealById = async (mealId: string) => {
  const { data, error } = await supabase
    .from('custom_meals')
    .select('*, ingredients:custom_meal_ingredients(*, pantry_item:pantry_items(*))')
    .eq('id', mealId)
    .single<CustomMeal>();

  return normalizeCustomMeal(requireData(data, error)) as CustomMeal;
};

export const ensureProfile = async (userId: string) => {
  const { data: existing, error: selectError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle<Profile>();

  if (selectError) {
    throw selectError;
  }

  if (existing) {
    return existing;
  }

  const { data: created, error: insertError } = await supabase
    .from('profiles')
    .insert({
      id: userId,
      ...profileDefaults,
    })
    .select('*')
    .single<Profile>();

  return requireData(created, insertError);
};

export const updateProfileTargets = async (
  userId: string,
  dailyCalorieTarget: number,
  dailyProteinTarget: number,
) => {
  const { data, error } = await supabase
    .from('profiles')
    .update({
      daily_calorie_target: dailyCalorieTarget,
      daily_protein_target: dailyProteinTarget,
    })
    .eq('id', userId)
    .select('*')
    .single<Profile>();

  return requireData(data, error);
};

export const getPantryItems = async (userId: string) => {
  const { data, error } = await supabase
    .from('pantry_items')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .returns<PantryItem[]>();

  return (requireData(data, error) ?? []).map((item) => normalizePantryItem(item) as PantryItem);
};

export const createPantryItem = async (
  userId: string,
  payload: {
    name: string;
    default_serving: string;
    serving_amount: number;
    serving_unit: string;
    stock_amount: number;
    calories_per_serving: number;
    protein_per_serving: number;
    quantity_label: string;
    category: string;
    effort_level: string;
    meal_role: string;
  },
) => {
  const { data, error } = await supabase
    .from('pantry_items')
    .insert({
      user_id: userId,
      is_active: true,
      ...payload,
    })
    .select('*')
    .single<PantryItem>();

  return normalizePantryItem(requireData(data, error)) as PantryItem;
};

export const updatePantryItem = async (
  itemId: string,
  payload: {
    name: string;
    default_serving: string;
    serving_amount: number;
    serving_unit: string;
    stock_amount: number;
    calories_per_serving: number;
    protein_per_serving: number;
    quantity_label: string;
    category: string;
    effort_level: string;
    meal_role: string;
  },
) => {
  const { data, error } = await supabase
    .from('pantry_items')
    .update(payload)
    .eq('id', itemId)
    .select('*')
    .single<PantryItem>();

  return normalizePantryItem(requireData(data, error)) as PantryItem;
};

export const archivePantryItem = async (itemId: string, isActive: boolean) => {
  const { data, error } = await supabase
    .from('pantry_items')
    .update({ is_active: isActive })
    .eq('id', itemId)
    .select('*')
    .single<PantryItem>();

  return normalizePantryItem(requireData(data, error)) as PantryItem;
};

export const updatePantryStock = async (itemId: string, stockAmount: number) => {
  const { data, error } = await supabase
    .from('pantry_items')
    .update({ stock_amount: stockAmount })
    .eq('id', itemId)
    .select('*')
    .single<PantryItem>();

  return normalizePantryItem(requireData(data, error)) as PantryItem;
};

export const updatePantryStocks = async (
  updates: {
    id: string;
    stock_amount: number;
  }[],
) => {
  const savedItems: PantryItem[] = [];

  for (const update of updates) {
    const savedItem = await updatePantryStock(update.id, update.stock_amount);
    savedItems.push(savedItem);
  }

  return savedItems;
};

export const getTodayLogs = async (userId: string) => {
  const { startIso, endIso } = getTodayRange();
  const { data, error } = await supabase
    .from('food_logs')
    .select('*, pantry_item:pantry_items(*)')
    .eq('user_id', userId)
    .gte('logged_at', startIso)
    .lte('logged_at', endIso)
    .order('logged_at', { ascending: false })
    .returns<FoodLogEntry[]>();

  return (requireData(data, error) ?? []).map(normalizeFoodLogEntry);
};

export const getCustomMeals = async (userId: string) => {
  const { data, error } = await supabase
    .from('custom_meals')
    .select('*, ingredients:custom_meal_ingredients(*, pantry_item:pantry_items(*))')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .returns<CustomMeal[]>();

  return (requireData(data, error) ?? [])
    .map((meal) => normalizeCustomMeal(meal))
    .filter(Boolean) as CustomMeal[];
};

export const createFoodLog = async (
  userId: string,
  payload: {
    pantry_item_id: string | null;
    custom_name: string | null;
    log_source: FoodLogSource;
    servings: number;
    pantry_amount_used: number | null;
    calories: number;
    protein: number;
    notes: string | null;
  },
) => {
  const { data, error } = await supabase
    .from('food_logs')
    .insert({
      user_id: userId,
      ...payload,
    })
    .select('*, pantry_item:pantry_items(*)')
    .single<FoodLogEntry>();

  return normalizeFoodLogEntry(requireData(data, error) as FoodLogEntry);
};

export const createFoodLogMealItems = async (
  payload: {
    user_id: string;
    food_log_id: string;
    pantry_item_id: string | null;
    ingredient_name: string;
    amount_used: number;
    calories: number;
    protein: number;
    sort_order: number;
  }[],
) => {
  const { data, error } = await supabase
    .from('food_log_meal_items')
    .insert(payload)
    .select('*, pantry_item:pantry_items(*)')
    .returns<FoodLogMealItem[]>();

  return (requireData(data, error) ?? [])
    .map((item) => normalizeFoodLogMealItem(item))
    .filter(Boolean) as FoodLogMealItem[];
};

export const getFoodLogMealItems = async (foodLogId: string) => {
  const { data, error } = await supabase
    .from('food_log_meal_items')
    .select('*, pantry_item:pantry_items(*)')
    .eq('food_log_id', foodLogId)
    .order('sort_order', { ascending: true })
    .returns<FoodLogMealItem[]>();

  return (requireData(data, error) ?? [])
    .map((item) => normalizeFoodLogMealItem(item))
    .filter(Boolean) as FoodLogMealItem[];
};

export const deleteFoodLogMealItems = async (foodLogId: string) => {
  const { error } = await supabase
    .from('food_log_meal_items')
    .delete()
    .eq('food_log_id', foodLogId);

  if (error) {
    throw error;
  }
};

export const replaceFoodLogMealItems = async (
  foodLogId: string,
  payload: {
    user_id: string;
    pantry_item_id: string | null;
    ingredient_name: string;
    amount_used: number;
    calories: number;
    protein: number;
    sort_order: number;
  }[],
) => {
  await deleteFoodLogMealItems(foodLogId);

  if (!payload.length) {
    return [] as FoodLogMealItem[];
  }

  return createFoodLogMealItems(
    payload.map((item) => ({
      ...item,
      food_log_id: foodLogId,
    })),
  );
};

export const createCustomMeal = async (
  userId: string,
  payload: {
    name: string;
    ingredients: {
      pantry_item_id: string;
      amount_used: number;
      sort_order: number;
    }[];
  },
) => {
  const { data: createdMeal, error: mealError } = await supabase
    .from('custom_meals')
    .insert({
      user_id: userId,
      name: payload.name,
    })
    .select('*')
    .single<CustomMeal>();

  const savedMeal = requireData(createdMeal, mealError);

  if (!savedMeal) {
    throw new Error('Unable to create custom meal.');
  }

  if (payload.ingredients.length) {
    const { error: ingredientsError } = await supabase
      .from('custom_meal_ingredients')
      .insert(
        payload.ingredients.map((ingredient) => ({
          user_id: userId,
          custom_meal_id: savedMeal.id,
          ...ingredient,
        })),
      );

    if (ingredientsError) {
      await supabase.from('custom_meals').delete().eq('id', savedMeal.id);
      throw ingredientsError;
    }
  }

  return getCustomMealById(savedMeal.id);
};

export const updateCustomMeal = async (
  mealId: string,
  userId: string,
  payload: {
    name: string;
    ingredients: {
      pantry_item_id: string;
      amount_used: number;
      sort_order: number;
    }[];
  },
) => {
  const { error: mealError } = await supabase
    .from('custom_meals')
    .update({
      name: payload.name,
    })
    .eq('id', mealId);

  if (mealError) {
    throw mealError;
  }

  const { error: deleteError } = await supabase
    .from('custom_meal_ingredients')
    .delete()
    .eq('custom_meal_id', mealId);

  if (deleteError) {
    throw deleteError;
  }

  if (payload.ingredients.length) {
    const { error: ingredientsError } = await supabase
      .from('custom_meal_ingredients')
      .insert(
        payload.ingredients.map((ingredient) => ({
          user_id: userId,
          custom_meal_id: mealId,
          ...ingredient,
        })),
      );

    if (ingredientsError) {
      throw ingredientsError;
    }
  }

  return getCustomMealById(mealId);
};

export const deleteCustomMeal = async (mealId: string) => {
  const { error } = await supabase
    .from('custom_meals')
    .delete()
    .eq('id', mealId);

  if (error) {
    throw error;
  }
};

export const updateFoodLog = async (
  entryId: string,
  payload: {
    custom_name: string | null;
    servings: number;
    pantry_amount_used: number | null;
    calories: number;
    protein: number;
    notes: string | null;
  },
) => {
  const { data, error } = await supabase
    .from('food_logs')
    .update(payload)
    .eq('id', entryId)
    .select('*, pantry_item:pantry_items(*)')
    .single<FoodLogEntry>();

  return normalizeFoodLogEntry(requireData(data, error) as FoodLogEntry);
};

export const updateGroupedFoodLog = async (
  entryId: string,
  payload: {
    custom_name: string | null;
    servings: number;
    calories: number;
    protein: number;
  },
) => {
  const { data, error } = await supabase
    .from('food_logs')
    .update(payload)
    .eq('id', entryId)
    .select('*, pantry_item:pantry_items(*)')
    .single<FoodLogEntry>();

  return normalizeFoodLogEntry(requireData(data, error) as FoodLogEntry);
};

export const deleteFoodLog = async (entryId: string) => {
  const { error } = await supabase
    .from('food_logs')
    .delete()
    .eq('id', entryId);

  if (error) {
    throw error;
  }
};
