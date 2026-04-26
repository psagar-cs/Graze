export type Profile = {
  id: string;
  daily_calorie_target: number;
  daily_protein_target: number;
  created_at: string;
  updated_at: string;
};

export type PantryItem = {
  id: string;
  user_id: string;
  name: string;
  default_serving: string;
  calories_per_serving: number;
  protein_per_serving: number;
  quantity_label: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type FoodLogEntry = {
  id: string;
  user_id: string;
  logged_at: string;
  pantry_item_id: string | null;
  custom_name: string | null;
  servings: number;
  calories: number;
  protein: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  pantry_item?: PantryItem | null;
};

export type TodaySummary = {
  consumedCalories: number;
  consumedProtein: number;
  remainingCalories: number;
  remainingProtein: number;
  percentCalories: number;
  percentProtein: number;
};

export type SuggestionPreview = {
  id: string;
  title: string;
  reason: string;
  effortLabel: string;
  estimatedCalories: number;
  estimatedProtein: number;
  isPreview: boolean;
};

export type PantryFormValues = {
  name: string;
  defaultServing: string;
  caloriesPerServing: string;
  proteinPerServing: string;
  quantityLabel: string;
};

export type FoodLogFormValues = {
  pantryItemId: string | null;
  customName: string;
  servings: string;
  calories: string;
  protein: string;
  notes: string;
};
