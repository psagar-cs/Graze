export type Profile = {
  id: string;
  daily_calorie_target: number;
  daily_protein_target: number;
  created_at: string;
  updated_at: string;
};

export type PantryCategory =
  | 'protein'
  | 'carb'
  | 'fat'
  | 'fruit'
  | 'vegetable'
  | 'dairy'
  | 'condiment'
  | 'snack'
  | 'other';

export type PantryEffortLevel = 'no_prep' | 'assemble' | 'microwave' | 'cook';
export type PantryMealRole = 'main' | 'base' | 'topping' | 'condiment' | 'snack';
export type PantryUnit = 'serving' | 'cup' | 'tbsp' | 'tsp' | 'piece' | 'can' | 'gram' | 'ounce' | 'pound';
export type PantryStockEntryMode = 'amount' | 'servings';
export type FoodLogSource = 'pantry_item' | 'custom' | 'suggested_grouped' | 'custom_meal_grouped';

export type PantryItem = {
  id: string;
  user_id: string;
  name: string;
  default_serving: string;
  serving_amount: number;
  serving_unit: PantryUnit;
  stock_amount: number;
  expires_on: string | null;
  calories_per_serving: number;
  protein_per_serving: number;
  quantity_label: string;
  category: PantryCategory;
  effort_level: PantryEffortLevel;
  meal_role: PantryMealRole;
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
  log_source: FoodLogSource;
  servings: number;
  pantry_amount_used: number | null;
  calories: number;
  protein: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  pantry_item?: PantryItem | null;
};

export type CustomMealIngredient = {
  id: string;
  user_id: string;
  custom_meal_id: string;
  pantry_item_id: string;
  amount_used: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
  pantry_item?: PantryItem | null;
};

export type CustomMeal = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  ingredients: CustomMealIngredient[];
};

export type FoodLogMealItem = {
  id: string;
  user_id: string;
  food_log_id: string;
  pantry_item_id: string | null;
  ingredient_name: string;
  amount_used: number;
  calories: number;
  protein: number;
  sort_order: number;
  created_at: string;
  pantry_item?: PantryItem | null;
};

export type GroupedFoodLogIngredientFormValue = {
  pantryItemId: string | null;
  amountUsedPerServing: string;
};

export type GroupedFoodLogFormValues = {
  title: string;
  mealServings: string;
  ingredients: GroupedFoodLogIngredientFormValue[];
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

export type SuggestionGoal = 'balanced' | 'bulk';

export type SuggestionPriority = 'balanced' | 'easy' | 'high_protein' | 'use_soon' | 'snack';

export type SuggestionIngredient = {
  pantryItemId: string;
  name: string;
  servingAmount: number;
  servingUnit: PantryUnit;
  stockAmountRequired: number;
  displayServing: string;
};

export type Suggestion = {
  id: string;
  canonicalKey: string;
  title: string;
  description: string;
  ingredients: string[];
  ingredientDetails: SuggestionIngredient[];
  estimatedCalories: number;
  estimatedProtein: number;
  estimatedPrepTimeMinutes: number;
  effortLevel: PantryEffortLevel;
  reason: string;
  caveats: string[];
  expiryWarning?: string | null;
};

export type SuggestionEngineResult = {
  suggestions: Suggestion[];
  caveats: string[];
  emptyState?: {
    title: string;
    description: string;
  };
};

export type SuggestionLogValues = {
  suggestionId: string;
  mealServings: string;
};

export type PantryFormValues = {
  name: string;
  servingAmount: string;
  servingUnit: PantryUnit;
  stockEntryMode: PantryStockEntryMode;
  stockAmount: string;
  stockServings: string;
  expiresOn: string;
  caloriesPerServing: string;
  proteinPerServing: string;
  quantityLabel: string;
  category: PantryCategory;
  effortLevel: PantryEffortLevel;
  mealRole: PantryMealRole;
};

export type FoodLogFormValues = {
  pantryItemId: string | null;
  customName: string;
  servings: string;
  amountUsed: string;
  calories: string;
  protein: string;
  notes: string;
};
