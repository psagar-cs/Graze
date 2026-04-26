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

  return requireData(data, error) ?? [];
};

export const createPantryItem = async (
  userId: string,
  payload: {
    name: string;
    default_serving: string;
    calories_per_serving: number;
    protein_per_serving: number;
    quantity_label: string;
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

  return requireData(data, error);
};

export const updatePantryItem = async (
  itemId: string,
  payload: {
    name: string;
    default_serving: string;
    calories_per_serving: number;
    protein_per_serving: number;
    quantity_label: string;
  },
) => {
  const { data, error } = await supabase
    .from('pantry_items')
    .update(payload)
    .eq('id', itemId)
    .select('*')
    .single<PantryItem>();

  return requireData(data, error);
};

export const archivePantryItem = async (itemId: string, isActive: boolean) => {
  const { data, error } = await supabase
    .from('pantry_items')
    .update({ is_active: isActive })
    .eq('id', itemId)
    .select('*')
    .single<PantryItem>();

  return requireData(data, error);
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

  return requireData(data, error) ?? [];
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

  return requireData(data, error);
};
