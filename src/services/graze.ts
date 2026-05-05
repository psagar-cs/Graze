import { supabase } from '../lib/supabase';
import { getTodayRange } from '../lib/dates';
import type { FoodLogEntry, PantryItem, Profile } from '../types';

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
  pantry_item: normalizePantryItem(entry.pantry_item),
});

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

export const createFoodLog = async (
  userId: string,
  payload: {
    pantry_item_id: string | null;
    custom_name: string | null;
    servings: number;
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
