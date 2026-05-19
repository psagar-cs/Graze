import { useAuth, useUser } from '@clerk/clerk-expo';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Field,
  LoadingBlock,
  ModalSheet,
  PrimaryButton,
  SectionCard,
  SheetStack,
  SheetSurface,
} from '../components/ui';
import { useGrazeData } from '../hooks/useGrazeData';
import { formatTime } from '../lib/dates';
import { getExpiryStatus } from '../lib/expiry';
import { formatCalories, formatProtein } from '../lib/format';
import {
  formatAmountWithUnit,
  formatInventoryNumber,
  formatUnitLabel,
  getServingsInStock,
  hasAnyStock,
} from '../lib/inventory';
import { getSuggestions } from '../services/suggestionEngine';
import type {
  CustomMeal,
  FoodLogMealItem,
  FoodLogEntry,
  FoodLogFormValues,
  GroupedFoodLogFormValues,
  GroupedFoodLogIngredientFormValue,
  PantryCategory,
  PantryEffortLevel,
  PantryFormValues,
  PantryItem,
  PantryMealRole,
  PantryStockEntryMode,
  PantryUnit,
  Suggestion,
  SuggestionPriority,
  SuggestionLogValues,
} from '../types';

type TabKey = 'today' | 'log' | 'pantry' | 'suggestions';
type GuideSectionKey = 'overview' | 'today' | 'log' | 'pantry' | 'suggestions' | 'saved';

const tabs: { key: TabKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'log', label: 'Log' },
  { key: 'pantry', label: 'Pantry' },
  { key: 'suggestions', label: 'Next' },
];

const pantryCategoryOptions: { label: string; value: PantryCategory }[] = [
  { label: 'Protein', value: 'protein' },
  { label: 'Carb', value: 'carb' },
  { label: 'Fat', value: 'fat' },
  { label: 'Fruit', value: 'fruit' },
  { label: 'Vegetable', value: 'vegetable' },
  { label: 'Dairy', value: 'dairy' },
  { label: 'Condiment', value: 'condiment' },
  { label: 'Snack', value: 'snack' },
  { label: 'Other', value: 'other' },
];

const effortOptions: { label: string; value: PantryEffortLevel }[] = [
  { label: 'No prep', value: 'no_prep' },
  { label: 'Assemble', value: 'assemble' },
  { label: 'Microwave', value: 'microwave' },
  { label: 'Cook', value: 'cook' },
];

const mealRoleOptions: { label: string; value: PantryMealRole }[] = [
  { label: 'Main', value: 'main' },
  { label: 'Base', value: 'base' },
  { label: 'Topping', value: 'topping' },
  { label: 'Condiment', value: 'condiment' },
  { label: 'Snack', value: 'snack' },
];

const pantryUnitOptions: { label: string; value: PantryUnit }[] = [
  { label: 'Serving', value: 'serving' },
  { label: 'Cup', value: 'cup' },
  { label: 'Tbsp', value: 'tbsp' },
  { label: 'Tsp', value: 'tsp' },
  { label: 'Piece', value: 'piece' },
  { label: 'Can', value: 'can' },
  { label: 'Gram', value: 'gram' },
  { label: 'Ounce', value: 'ounce' },
  { label: 'Lb', value: 'pound' },
];

const stockEntryOptions: { label: string; value: PantryStockEntryMode }[] = [
  { label: 'Amount in stock', value: 'amount' },
  { label: 'Servings in stock', value: 'servings' },
];

const suggestionPriorityOptions: { label: string; value: SuggestionPriority }[] = [
  { label: 'Balanced', value: 'balanced' },
  { label: 'Easy', value: 'easy' },
  { label: 'High protein', value: 'high_protein' },
  { label: 'Use soon', value: 'use_soon' },
  { label: 'Snack', value: 'snack' },
];

const suggestionPriorityDescriptions: Record<SuggestionPriority, string> = {
  balanced: 'Balanced pantry suggestions',
  easy: 'Prioritizing low-effort options',
  high_protein: 'Prioritizing higher-protein options',
  use_soon: 'Prioritizing ingredients that expire soon',
  snack: 'Prioritizing snack-like options',
};

const guideSectionOrder: GuideSectionKey[] = ['overview', 'today', 'log', 'pantry', 'suggestions', 'saved'];

const guideSectionContent: Record<
  GuideSectionKey,
  {
    title: string;
    subtitle: string;
    lines: string[];
  }
> = {
  overview: {
    title: 'What Graze is',
    subtitle: 'A pantry-aware food logger with deterministic meal suggestions built around the MVP goals that matter right now.',
    lines: [
      'Graze is not using a generative AI recommender right now. Suggestions come from pantry-based patterns and a custom score.',
      'The MVP optimizes around calorie fit and protein fit first, then layers in effort, expiry urgency, coherence, and the selected priority mode.',
      'Active pantry items with stock available are the building blocks for quick logging, saved meals, and Next suggestions.',
    ],
  },
  today: {
    title: 'Today',
    subtitle: 'This tab keeps the daily target model simple so the rest of the app has a clear anchor.',
    lines: [
      'Calories and protein are the two user goals the MVP tracks explicitly.',
      'Remaining calories and protein help shape which suggestions feel like a better fit next.',
      'Recent entries are editable so you can correct accidental logs without breaking pantry-linked inventory.',
    ],
  },
  log: {
    title: 'Log',
    subtitle: 'Logging is split into fast pantry-based actions and a fallback for food that never lived in your pantry.',
    lines: [
      'Quick add is for stocked pantry staples you use often.',
      'Manual entry is the catch-all for eating out or one-off food that should not deduct pantry stock.',
      'Saving a recommendation creates a reusable pantry-based meal template that you can rename later.',
    ],
  },
  pantry: {
    title: 'Pantry',
    subtitle: 'Pantry items are the reusable ingredients that power inventory-aware logging and suggestions.',
    lines: [
      'Archived items stay in your account but stop participating in suggestions and quick logging.',
      'Clear stock keeps the ingredient but marks it as unavailable until you restock.',
      'Delete is permanent and can remove saved meals that depend on that ingredient, so archive is the safer hide mechanic.',
      'Expiry dates are optional, but when present they can suppress expired items and boost soon-to-expire ones.',
    ],
  },
  suggestions: {
    title: 'Next',
    subtitle: 'Suggestions are deterministic pantry combinations ranked by a custom score plus the currently selected priority mode.',
    lines: [
      'Balanced tries to find sensible pantry meals that fit your remaining calories and protein.',
      'Easy prefers lower-friction options first, with no-prep items ahead of assembly, microwave, and cook.',
      'High protein pushes protein-forward ideas higher, Use soon lifts ingredients nearing expiry, and Snack is the snack-first mode.',
      'Not feeling it rotates away the current exact meal idea, while Save meal turns a suggestion into a reusable custom meal.',
    ],
  },
  saved: {
    title: "What's saved where",
    subtitle: 'Graze separates ingredients, reusable meal templates, and logged history so each part of the app stays understandable.',
    lines: [
      'Pantry items are the ingredient-level building blocks.',
      'Saved meals are pantry-based templates that log as one grouped entry while deducting each linked ingredient behind the scenes.',
      'Logged meals affect pantry stock when they came from pantry ingredients, while manual out-of-pantry logs only affect history and targets.',
    ],
  },
};

const validateNumber = (value: string) => Number.isFinite(Number(value)) && value.trim() !== '';

type CustomMealIngredientForm = {
  pantryItemId: string | null;
  amountUsed: string;
};

type CustomMealFormValues = {
  name: string;
  ingredients: CustomMealIngredientForm[];
};

const emptyCustomMealForm = (): CustomMealFormValues => ({
  name: '',
  ingredients: [{ pantryItemId: null, amountUsed: '1' }],
});

const emptyGroupedFoodLogForm = (): GroupedFoodLogFormValues => ({
  title: '',
  mealServings: '1',
  ingredients: [],
});

const formatEffortLabel = (effortLevel: PantryEffortLevel) =>
  ({
    no_prep: 'No prep',
    assemble: 'Assemble',
    microwave: 'Microwave',
    cook: 'Cook',
  })[effortLevel];

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

const summarizeCustomMeal = (meal: CustomMeal) => {
  const resolvedIngredients = meal.ingredients
    .map((ingredient) => {
      const pantryItem = ingredient.pantry_item;

      if (!pantryItem) {
        return {
          ingredient,
          pantryItem: null,
          calories: 0,
          protein: 0,
          hasProblem: true,
          isArchived: false,
        };
      }

      const nutrition = calculateIngredientNutrition(pantryItem, ingredient.amount_used);

      return {
        ingredient,
        pantryItem,
        calories: nutrition.calories,
        protein: nutrition.protein,
        hasProblem: !pantryItem.is_active,
        isArchived: !pantryItem.is_active,
      };
    });

  return {
    calories: Math.round(resolvedIngredients.reduce((sum, ingredient) => sum + ingredient.calories, 0)),
    protein: Math.round(resolvedIngredients.reduce((sum, ingredient) => sum + ingredient.protein, 0)),
    ingredientCount: resolvedIngredients.length,
    hasProblem: resolvedIngredients.some((ingredient) => !ingredient.pantryItem || ingredient.hasProblem),
    hasArchivedIngredients: resolvedIngredients.some((ingredient) => ingredient.isArchived),
  };
};

const buildCustomMealCanonicalKey = (meal: CustomMeal) =>
  meal.ingredients
    .map((ingredient) => ingredient.pantry_item_id)
    .sort()
    .join('|');

const getCustomMealAvailability = (meal: CustomMeal, pantryItems: PantryItem[]) => {
  let unavailableReason: string | null = null;
  let hasArchivedIngredients = false;

  meal.ingredients.forEach((ingredient) => {
    const pantryItem = ingredient.pantry_item ?? pantryItems.find((item) => item.id === ingredient.pantry_item_id) ?? null;

    if (!pantryItem) {
      if (!unavailableReason) {
        unavailableReason = `Missing ${ingredient.pantry_item?.name ?? 'ingredient'}.`;
      }
      return;
    }

    if (!pantryItem.is_active) {
      hasArchivedIngredients = true;
      if (!unavailableReason) {
        unavailableReason = `${pantryItem.name} is archived.`;
      }
      return;
    }

    if (ingredient.amount_used - pantryItem.stock_amount > 0.0001) {
      if (!unavailableReason) {
        unavailableReason = `Not enough ${pantryItem.name}.`;
      }
    }
  });

  return {
    isAvailable: unavailableReason === null,
    unavailableReason,
    hasArchivedIngredients,
  };
};

export function HomeScreen() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const {
    customMeals,
    error,
    loading,
    editGroupedFoodLog,
    loadFoodLogMealItems,
    logCustomMeal,
    pantryItems,
    profile,
    refresh,
    refreshing,
    clearPantryStock,
    editFoodLog,
    removeFoodLog,
    removeGroupedFoodLog,
    removeCustomMeal,
    removePantryItem,
    saveFoodLog,
    saveCustomMeal,
    saveSuggestionAsCustomMeal,
    savePantryItem,
    saveSuggestedMealLog,
    saveTargets,
    submitting,
    todayLogs,
    todaySummary,
    togglePantryItem,
    emptyFoodLogForm,
    emptyPantryForm,
  } = useGrazeData();

  const [activeTab, setActiveTab] = useState<TabKey>('today');
  const [targetsCalories, setTargetsCalories] = useState('');
  const [targetsProtein, setTargetsProtein] = useState('');
  const [pantryModalOpen, setPantryModalOpen] = useState(false);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PantryItem | null>(null);
  const [pantryForm, setPantryForm] = useState<PantryFormValues>(emptyPantryForm);
  const [logForm, setLogForm] = useState<FoodLogFormValues>(emptyFoodLogForm);
  const [editLogModalOpen, setEditLogModalOpen] = useState(false);
  const [editingLogEntry, setEditingLogEntry] = useState<FoodLogEntry | null>(null);
  const [editLogForm, setEditLogForm] = useState<FoodLogFormValues>(emptyFoodLogForm);
  const [editingLogMealItems, setEditingLogMealItems] = useState<FoodLogMealItem[]>([]);
  const [editGroupedLogForm, setEditGroupedLogForm] = useState<GroupedFoodLogFormValues>(emptyGroupedFoodLogForm);
  const [editGroupedLogPickerIndex, setEditGroupedLogPickerIndex] = useState<number | null>(null);
  const [loadingLogMealItems, setLoadingLogMealItems] = useState(false);
  const [confirmDeleteLog, setConfirmDeleteLog] = useState(false);
  const [customMealModalOpen, setCustomMealModalOpen] = useState(false);
  const [editingCustomMeal, setEditingCustomMeal] = useState<CustomMeal | null>(null);
  const [customMealForm, setCustomMealForm] = useState<CustomMealFormValues>(emptyCustomMealForm);
  const [customMealPickerIndex, setCustomMealPickerIndex] = useState<number | null>(null);
  const [customMealLogOpen, setCustomMealLogOpen] = useState(false);
  const [selectedCustomMeal, setSelectedCustomMeal] = useState<CustomMeal | null>(null);
  const [customMealLogServings, setCustomMealLogServings] = useState('1');
  const [pendingDeleteMealId, setPendingDeleteMealId] = useState<string | null>(null);
  const [suggestionLogOpen, setSuggestionLogOpen] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<Suggestion | null>(null);
  const [suggestionLogForm, setSuggestionLogForm] = useState<SuggestionLogValues>({
    suggestionId: '',
    mealServings: '1',
  });
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideFocus, setGuideFocus] = useState<GuideSectionKey>('overview');
  const [pendingDeletePantryItem, setPendingDeletePantryItem] = useState<PantryItem | null>(null);
  const [dismissedSuggestionIds, setDismissedSuggestionIds] = useState<string[]>([]);
  const [suggestionSeed, setSuggestionSeed] = useState(0);
  const [suggestionPriority, setSuggestionPriority] = useState<SuggestionPriority>('balanced');

  const activePantry = pantryItems.filter((item) => item.is_active);
  const stockedPantry = activePantry.filter((item) => hasAnyStock(item));
  const sortedPantryItems = [...pantryItems].sort((left, right) => {
    if (left.is_active !== right.is_active) {
      return left.is_active ? -1 : 1;
    }

    if (!left.is_active && !right.is_active) {
      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    }

    const leftExpiry = getExpiryStatus(left.expires_on);
    const rightExpiry = getExpiryStatus(right.expires_on);
    const getPriority = (value: ReturnType<typeof getExpiryStatus>) => {
      if (value.isExpired) {
        return 0;
      }

      if (value.isToday) {
        return 1;
      }

      if (value.isSoon) {
        return 2;
      }

      if (value.hasExpiry) {
        return 3;
      }

      return 4;
    };

    const priorityDifference = getPriority(leftExpiry) - getPriority(rightExpiry);

    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    if (leftExpiry.daysUntil !== null && rightExpiry.daysUntil !== null && leftExpiry.daysUntil !== rightExpiry.daysUntil) {
      return leftExpiry.daysUntil - rightExpiry.daysUntil;
    }

    if (leftExpiry.daysUntil !== null && rightExpiry.daysUntil === null) {
      return -1;
    }

    if (leftExpiry.daysUntil === null && rightExpiry.daysUntil !== null) {
      return 1;
    }

    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  });
  const selectedPantryItem = pantryItems.find((item) => item.id === logForm.pantryItemId) ?? null;
  const editingLogPantryItem = pantryItems.find((item) => item.id === editLogForm.pantryItemId) ?? null;
  const suggestionResult = getSuggestions({
    pantryItems: activePantry,
    todayLogs,
    profile,
    todaySummary,
    now: new Date(),
    goal: 'balanced',
    priority: suggestionPriority,
    excludedSuggestionIds: dismissedSuggestionIds,
    variationSeed: suggestionSeed,
  });
  const savedMealCanonicalKeys = new Set(customMeals.map((meal) => buildCustomMealCanonicalKey(meal)));
  const pendingDeletePantryMealCount = pendingDeletePantryItem
    ? customMeals.filter((meal) => meal.ingredients.some((ingredient) => ingredient.pantry_item_id === pendingDeletePantryItem.id)).length
    : 0;
  const focusedGuideSection = guideSectionContent[guideFocus];

  useEffect(() => {
    setDismissedSuggestionIds([]);
    setSuggestionSeed(0);
  }, [
    activePantry.map((item) => `${item.id}:${item.updated_at}`).join('|'),
    todayLogs.map((entry) => `${entry.id}:${entry.updated_at}`).join('|'),
    profile?.daily_calorie_target,
    profile?.daily_protein_target,
  ]);

  useEffect(() => {
    setDismissedSuggestionIds([]);
    setSuggestionSeed(0);
  }, [suggestionPriority]);

  const syncTargets = () => {
    if (!profile) {
      return;
    }

    setTargetsCalories(String(profile.daily_calorie_target));
    setTargetsProtein(String(profile.daily_protein_target));
  };

  useEffect(() => {
    if (!profile) {
      return;
    }

    setTargetsCalories(String(profile.daily_calorie_target));
    setTargetsProtein(String(profile.daily_protein_target));
  }, [profile?.daily_calorie_target, profile?.daily_protein_target]);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-oat">
        <LoadingBlock label="Loading your pantry, targets, and today’s progress..." />
      </SafeAreaView>
    );
  }

  const openNewPantry = () => {
    setEditingItem(null);
    setPantryForm(emptyPantryForm());
    setPantryModalOpen(true);
  };

  const openEditPantry = (item: PantryItem) => {
    setEditingItem(item);
    setPantryForm({
      name: item.name,
      servingAmount: String(item.serving_amount),
      servingUnit: item.serving_unit,
      stockEntryMode: 'amount',
      stockAmount: String(item.stock_amount),
      stockServings: String(getServingsInStock(item)),
      expiresOn: item.expires_on ?? '',
      caloriesPerServing: String(item.calories_per_serving),
      proteinPerServing: String(item.protein_per_serving),
      quantityLabel: item.quantity_label,
      category: item.category,
      effortLevel: item.effort_level,
      mealRole: item.meal_role,
    });
    setPantryModalOpen(true);
  };

  const submitPantry = async () => {
    if (
      !pantryForm.name.trim() ||
      !validateNumber(pantryForm.servingAmount) ||
      !validateNumber(pantryForm.caloriesPerServing) ||
      !validateNumber(pantryForm.proteinPerServing) ||
      !(
        pantryForm.stockEntryMode === 'amount'
          ? validateNumber(pantryForm.stockAmount)
          : validateNumber(pantryForm.stockServings)
      )
    ) {
      return;
    }

    await savePantryItem(pantryForm, editingItem);
    setPantryModalOpen(false);
    setEditingItem(null);
    setPantryForm(emptyPantryForm());
  };

  const confirmDeletePantry = async () => {
    if (!pendingDeletePantryItem) {
      return;
    }

    try {
      await removePantryItem(pendingDeletePantryItem);
      setPendingDeletePantryItem(null);
    } catch {}
  };

  const startLogFromPantry = (item: PantryItem) => {
    setLogForm({
      pantryItemId: item.id,
      customName: item.name,
      servings: '1',
      amountUsed: '',
      calories: String(item.calories_per_serving),
      protein: String(item.protein_per_serving),
      notes: '',
    });
    setLogModalOpen(true);
  };

  const openNewCustomMeal = () => {
    setEditingCustomMeal(null);
    setCustomMealForm(emptyCustomMealForm());
    setPendingDeleteMealId(null);
    setCustomMealModalOpen(true);
  };

  const openEditCustomMeal = (meal: CustomMeal) => {
    setEditingCustomMeal(meal);
    setPendingDeleteMealId(null);
    setCustomMealForm({
      name: meal.name,
      ingredients: meal.ingredients.map((ingredient) => ({
        pantryItemId: ingredient.pantry_item_id,
        amountUsed: String(ingredient.amount_used),
      })),
    });
    setCustomMealModalOpen(true);
  };

  const closeCustomMealModal = () => {
    setCustomMealModalOpen(false);
    setEditingCustomMeal(null);
    setCustomMealForm(emptyCustomMealForm());
    setCustomMealPickerIndex(null);
    setPendingDeleteMealId(null);
  };

  const addCustomMealIngredient = () => {
    setCustomMealForm((current) => ({
      ...current,
      ingredients: [...current.ingredients, { pantryItemId: null, amountUsed: '1' }],
    }));
  };

  const removeCustomMealIngredient = (index: number) => {
    setCustomMealForm((current) => ({
      ...current,
      ingredients: current.ingredients.length === 1
        ? [{ pantryItemId: null, amountUsed: '1' }]
        : current.ingredients.filter((_, entryIndex) => entryIndex !== index),
    }));
    setCustomMealPickerIndex((current) => {
      if (current === null) {
        return null;
      }

      if (current === index) {
        return null;
      }

      if (current > index) {
        return current - 1;
      }

      return current;
    });
  };

  const updateCustomMealIngredient = (
    index: number,
    updates: Partial<CustomMealIngredientForm>,
  ) => {
    setCustomMealForm((current) => ({
      ...current,
      ingredients: current.ingredients.map((ingredient, entryIndex) =>
        entryIndex === index
          ? {
              ...ingredient,
              ...updates,
            }
          : ingredient),
    }));
  };

  const mealFormResolvedIngredients = customMealForm.ingredients.map((ingredient) => {
    const pantryItem = pantryItems.find((item) => item.id === ingredient.pantryItemId) ?? null;
    const amountUsed = Number(ingredient.amountUsed);

    if (!pantryItem || !Number.isFinite(amountUsed) || amountUsed <= 0) {
      return null;
    }

    const nutrition = calculateIngredientNutrition(pantryItem, amountUsed);

    return {
      pantryItem,
      amountUsed,
      calories: nutrition.calories,
      protein: nutrition.protein,
    };
  }).filter(Boolean) as {
    pantryItem: PantryItem;
    amountUsed: number;
    calories: number;
    protein: number;
  }[];

  const mealFormSummary = {
    calories: Math.round(mealFormResolvedIngredients.reduce((sum, ingredient) => sum + ingredient.calories, 0)),
    protein: Math.round(mealFormResolvedIngredients.reduce((sum, ingredient) => sum + ingredient.protein, 0)),
  };
  const customMealIngredientIds = customMealForm.ingredients.map((ingredient) => ingredient.pantryItemId).filter(Boolean);
  const customMealFormIssue = !customMealForm.name.trim()
    ? 'Give the meal a name.'
    : customMealForm.ingredients.some((ingredient) => !ingredient.pantryItemId)
      ? 'Choose a pantry item for each ingredient row.'
      : customMealForm.ingredients.some((ingredient) => !validateNumber(ingredient.amountUsed) || Number(ingredient.amountUsed) <= 0)
        ? 'Enter a valid positive amount for each ingredient.'
        : new Set(customMealIngredientIds).size !== customMealIngredientIds.length
          ? 'Use each pantry item only once per saved meal.'
          : customMealForm.ingredients.some((ingredient) => {
              const pantryItem = pantryItems.find((item) => item.id === ingredient.pantryItemId) ?? null;
              return !pantryItem || !pantryItem.is_active;
            })
            ? 'Replace archived or missing pantry items before saving this meal.'
            : null;

  const groupedLogResolvedIngredients = editGroupedLogForm.ingredients.map((ingredient) => {
    const pantryItem = pantryItems.find((item) => item.id === ingredient.pantryItemId) ?? null;
    const mealServings = Number(editGroupedLogForm.mealServings);
    const amountUsedPerServing = Number(ingredient.amountUsedPerServing);

    if (!pantryItem || !Number.isFinite(mealServings) || mealServings <= 0 || !Number.isFinite(amountUsedPerServing) || amountUsedPerServing <= 0) {
      return null;
    }

    const totalAmountUsed = amountUsedPerServing * mealServings;
    const nutrition = calculateIngredientNutrition(pantryItem, totalAmountUsed);

    return {
      pantryItem,
      amountUsedPerServing,
      totalAmountUsed,
      calories: nutrition.calories,
      protein: nutrition.protein,
    };
  }).filter(Boolean) as {
    pantryItem: PantryItem;
    amountUsedPerServing: number;
    totalAmountUsed: number;
    calories: number;
    protein: number;
  }[];

  const groupedLogSummary = {
    calories: Math.round(groupedLogResolvedIngredients.reduce((sum, ingredient) => sum + ingredient.calories, 0)),
    protein: Math.round(groupedLogResolvedIngredients.reduce((sum, ingredient) => sum + ingredient.protein, 0)),
  };
  const groupedLogIngredientIds = editGroupedLogForm.ingredients.map((ingredient) => ingredient.pantryItemId).filter(Boolean);
  const groupedLogFormIssue = !editGroupedLogForm.title.trim()
    ? 'Give the grouped meal a name.'
    : !validateNumber(editGroupedLogForm.mealServings) || Number(editGroupedLogForm.mealServings) <= 0
      ? 'Enter a valid positive meal servings value.'
      : !editGroupedLogForm.ingredients.length
        ? 'Add at least one pantry ingredient.'
        : editGroupedLogForm.ingredients.some((ingredient) => !ingredient.pantryItemId)
          ? 'Choose a pantry item for each grouped ingredient row.'
          : editGroupedLogForm.ingredients.some((ingredient) => !validateNumber(ingredient.amountUsedPerServing) || Number(ingredient.amountUsedPerServing) <= 0)
            ? 'Enter a valid positive amount for each grouped ingredient.'
            : new Set(groupedLogIngredientIds).size !== groupedLogIngredientIds.length
              ? 'Use each pantry item only once in a grouped meal log.'
              : editGroupedLogForm.ingredients.some((ingredient) => {
                  const pantryItem = pantryItems.find((item) => item.id === ingredient.pantryItemId) ?? null;
                  return !pantryItem || !pantryItem.is_active;
                })
                ? 'Replace archived or missing pantry items before saving this grouped meal.'
                : null;

  const submitCustomMeal = async () => {
    const trimmedName = customMealForm.name.trim();

    if (customMealFormIssue) {
      return;
    }

    const payloadIngredients = customMealForm.ingredients.map((ingredient, index) => {
      return {
        pantry_item_id: ingredient.pantryItemId as string,
        amount_used: Number(ingredient.amountUsed),
        sort_order: index,
      };
    });

    await saveCustomMeal(
      {
        name: trimmedName,
        ingredients: payloadIngredients,
      },
      editingCustomMeal,
    );

    closeCustomMealModal();
  };

  const deleteCurrentCustomMeal = async (meal: CustomMeal) => {
    if (pendingDeleteMealId !== meal.id) {
      setPendingDeleteMealId(meal.id);
      return;
    }

    await removeCustomMeal(meal);
    if (editingCustomMeal?.id === meal.id) {
      closeCustomMealModal();
      return;
    }

    setPendingDeleteMealId(null);
  };

  const openCustomMealLog = (meal: CustomMeal) => {
    setSelectedCustomMeal(meal);
    setCustomMealLogServings('1');
    setCustomMealLogOpen(true);
  };

  const submitCustomMealLog = async () => {
    if (!selectedCustomMeal || !validateNumber(customMealLogServings)) {
      return;
    }

    await logCustomMeal(selectedCustomMeal, customMealLogServings);
    setCustomMealLogOpen(false);
    setSelectedCustomMeal(null);
    setCustomMealLogServings('1');
  };

  const closeEditLog = () => {
    setEditLogModalOpen(false);
    setEditingLogEntry(null);
    setEditingLogMealItems([]);
    setEditGroupedLogForm(emptyGroupedFoodLogForm());
    setEditGroupedLogPickerIndex(null);
    setLoadingLogMealItems(false);
    setEditLogForm(emptyFoodLogForm());
    setConfirmDeleteLog(false);
  };

  const openEditLog = async (entry: FoodLogEntry) => {
    setEditingLogEntry(entry);
    setConfirmDeleteLog(false);
    setEditingLogMealItems([]);
    setEditLogForm({
      pantryItemId: entry.pantry_item_id,
      customName: entry.pantry_item?.name ?? entry.custom_name ?? '',
      servings: String(entry.servings),
      amountUsed: entry.pantry_amount_used ? String(entry.pantry_amount_used) : '',
      calories: String(entry.calories),
      protein: String(entry.protein),
      notes: entry.notes ?? '',
    });
    setEditLogModalOpen(true);

    if (entry.log_source === 'suggested_grouped' || entry.log_source === 'custom_meal_grouped') {
      setLoadingLogMealItems(true);

      try {
        const mealItems = await loadFoodLogMealItems(entry.id);
        setEditingLogMealItems(mealItems);
        if (mealItems.length) {
          const safeServings = Number(entry.servings) > 0 ? Number(entry.servings) : 1;
          setEditGroupedLogForm({
            title: entry.custom_name ?? 'Grouped meal',
            mealServings: String(entry.servings),
            ingredients: mealItems.map((ingredient) => ({
              pantryItemId: ingredient.pantry_item_id,
              amountUsedPerServing: String(Number((ingredient.amount_used / safeServings).toFixed(2))),
            })),
          });
        }
      } finally {
        setLoadingLogMealItems(false);
      }
    }
  };

  const addGroupedLogIngredient = () => {
    setEditGroupedLogForm((current) => ({
      ...current,
      ingredients: [...current.ingredients, { pantryItemId: null, amountUsedPerServing: '1' }],
    }));
  };

  const removeGroupedLogIngredient = (index: number) => {
    setEditGroupedLogForm((current) => ({
      ...current,
      ingredients: current.ingredients.length === 1
        ? []
        : current.ingredients.filter((_, entryIndex) => entryIndex !== index),
    }));
    setEditGroupedLogPickerIndex((current) => {
      if (current === null) {
        return null;
      }

      if (current === index) {
        return null;
      }

      if (current > index) {
        return current - 1;
      }

      return current;
    });
  };

  const updateGroupedLogIngredient = (
    index: number,
    updates: Partial<GroupedFoodLogIngredientFormValue>,
  ) => {
    setEditGroupedLogForm((current) => ({
      ...current,
      ingredients: current.ingredients.map((ingredient, entryIndex) =>
        entryIndex === index
          ? {
              ...ingredient,
              ...updates,
            }
          : ingredient),
    }));
  };

  const suggestAgain = () => {
    const currentIds = suggestionResult.suggestions.map((suggestion) => suggestion.canonicalKey);
    const nextExcludedIds = Array.from(new Set([...dismissedSuggestionIds, ...currentIds]));
    const nextSeed = suggestionSeed + 1;
    const nextResult = getSuggestions({
      pantryItems: activePantry,
      todayLogs,
      profile,
      todaySummary,
      now: new Date(),
      goal: 'balanced',
      priority: suggestionPriority,
      excludedSuggestionIds: nextExcludedIds,
      variationSeed: nextSeed,
    });

    if (nextResult.suggestions.length) {
      setDismissedSuggestionIds(nextExcludedIds);
      setSuggestionSeed(nextSeed);
      return;
    }

    setDismissedSuggestionIds([]);
    setSuggestionSeed(nextSeed);
  };

  const submitLog = async () => {
    const hasName = logForm.pantryItemId || logForm.customName.trim();

    if (!hasName || !validateNumber(logForm.servings) || !validateNumber(logForm.calories) || !validateNumber(logForm.protein)) {
      return;
    }

    await saveFoodLog(logForm);
    setLogModalOpen(false);
    setLogForm(emptyFoodLogForm());
  };

  const openSuggestionLog = (suggestion: Suggestion) => {
    setSelectedSuggestion(suggestion);
    setSuggestionLogForm({
      suggestionId: suggestion.id,
      mealServings: '1',
    });
    setSuggestionLogOpen(true);
  };

  const saveSuggestionMeal = async (suggestion: Suggestion) => {
    await saveSuggestionAsCustomMeal(suggestion);
  };

  const submitSuggestionLog = async () => {
    if (!selectedSuggestion || !validateNumber(suggestionLogForm.mealServings)) {
      return;
    }

    await saveSuggestedMealLog(selectedSuggestion, suggestionLogForm.mealServings);
    setSuggestionLogOpen(false);
    setSelectedSuggestion(null);
    setSuggestionLogForm({
      suggestionId: '',
      mealServings: '1',
    });
  };

  const submitEditLog = async () => {
    if (!editingLogEntry) {
      return;
    }

    if (editingLogEntry.log_source === 'suggested_grouped' || editingLogEntry.log_source === 'custom_meal_grouped') {
      if (groupedLogFormIssue) {
        return;
      }

      const savedMealItems = await editGroupedFoodLog(editingLogEntry, editGroupedLogForm, editingLogMealItems);
      setEditingLogMealItems(savedMealItems);
      closeEditLog();
      return;
    }

    const hasName = editLogForm.pantryItemId || editLogForm.customName.trim();

    if (
      !hasName
      || !validateNumber(editLogForm.servings)
      || !validateNumber(editLogForm.calories)
      || !validateNumber(editLogForm.protein)
    ) {
      return;
    }

    await editFoodLog(editingLogEntry, editLogForm);
    closeEditLog();
  };

  const deleteCurrentLog = async () => {
    if (!editingLogEntry) {
      return;
    }

    if (!confirmDeleteLog) {
      setConfirmDeleteLog(true);
      return;
    }

    if (editingLogEntry.log_source === 'suggested_grouped' || editingLogEntry.log_source === 'custom_meal_grouped') {
      await removeGroupedFoodLog(editingLogEntry, editingLogMealItems);
      closeEditLog();
      return;
    }

    await removeFoodLog(editingLogEntry);
    closeEditLog();
  };

  const renderToday = () => (
    <View className="gap-4">
      <SectionCard subtitle="Set the two targets that matter in v1: calories and protein." title="Targets">
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Field
              keyboardType="numeric"
              label="Calories"
              onChangeText={setTargetsCalories}
              placeholder={String(profile?.daily_calorie_target ?? 3000)}
              value={targetsCalories}
            />
          </View>
          <View className="flex-1">
            <Field
              keyboardType="numeric"
              label="Protein (g)"
              onChangeText={setTargetsProtein}
              placeholder={String(profile?.daily_protein_target ?? 180)}
              value={targetsProtein}
            />
          </View>
        </View>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <PrimaryButton
              disabled={submitting || !validateNumber(targetsCalories) || !validateNumber(targetsProtein)}
              label={submitting ? 'Saving...' : 'Save targets'}
              onPress={() => saveTargets(targetsCalories, targetsProtein)}
            />
          </View>
          <View className="flex-1">
            <PrimaryButton label="Use current values" onPress={syncTargets} variant="ghost" />
          </View>
        </View>
      </SectionCard>

      <SectionCard subtitle="A quick glance at how much room is left today." title="Today so far">
        <View className="flex-row gap-3">
          <MetricCard
            label="Calories"
            progress={todaySummary.percentCalories}
            remaining={todaySummary.remainingCalories}
            value={todaySummary.consumedCalories}
          />
          <MetricCard
            label="Protein"
            progress={todaySummary.percentProtein}
            remaining={todaySummary.remainingProtein}
            value={todaySummary.consumedProtein}
          />
        </View>
      </SectionCard>

      <SectionCard subtitle="Most recent first so the app stays useful in the middle of the day." title="Recent entries">
        {todayLogs.length ? (
          <View className="gap-3">
            {todayLogs.map((entry) => (
              <View
                className="rounded-2xl border border-moss/10 bg-oat px-4 py-3"
                key={entry.id}
              >
                <View className="flex-row items-center justify-between gap-3">
                  <View className="flex-1 pr-3">
                    <Text className="text-base font-semibold text-ink">
                      {entry.pantry_item?.name ?? entry.custom_name ?? 'Food log'}
                    </Text>
                    <Text className="mt-1 text-sm text-ink/60">
                      {entry.servings} serving(s) • {formatTime(entry.logged_at)}
                    </Text>
                    {entry.log_source === 'suggested_grouped' || entry.log_source === 'custom_meal_grouped' ? (
                      <Text className="mt-1 text-sm text-moss">Grouped meal entry</Text>
                    ) : null}
                  </View>
                  <Text className="text-right text-sm font-semibold text-pine">
                    {entry.calories} cal{'\n'}
                    {entry.protein}g protein
                  </Text>
                </View>
                <View className="mt-3">
                  <PrimaryButton
                    label={entry.log_source === 'suggested_grouped' || entry.log_source === 'custom_meal_grouped' ? 'Edit meal' : 'Edit entry'}
                    onPress={() => {
                      void openEditLog(entry);
                    }}
                    variant="ghost"
                  />
                </View>
              </View>
            ))}
          </View>
        ) : (
          <EmptyState
            actionLabel="Log first meal"
            description="Nothing logged yet today. Start with a pantry staple or add a manual entry."
            onPress={() => setLogModalOpen(true)}
            title="No entries yet"
          />
        )}
      </SectionCard>
    </View>
  );

  const renderLog = () => (
    <View className="gap-4">
      <SectionCard subtitle="One-tap logging from the staples you already keep around." title="Quick add">
        {stockedPantry.length ? (
          <View className="gap-3">
            {stockedPantry.map((item) => (
              <View
                className="flex-row items-center justify-between rounded-2xl border border-moss/10 bg-white px-4 py-3"
                key={item.id}
              >
                <View className="flex-1 pr-4">
                  <Text className="text-base font-semibold text-ink">{item.name}</Text>
                  <Text className="mt-1 text-sm text-ink/60">
                    {item.default_serving} • {formatCalories(item.calories_per_serving)} • {formatProtein(item.protein_per_serving)}
                  </Text>
                  <Text className="mt-1 text-sm text-moss">
                    {formatAmountWithUnit(item.stock_amount, item.serving_unit)} in stock
                  </Text>
                </View>
                <PrimaryButton label="Log" onPress={() => startLogFromPantry(item)} />
              </View>
            ))}
          </View>
        ) : (
          <EmptyState
            actionLabel={activePantry.length ? 'Open pantry' : 'Add pantry item'}
            description={
              activePantry.length
                ? 'Your pantry has items, but none currently have stock available to log.'
                : 'Your quick-add list appears here once you set up a few staple ingredients.'
            }
            onPress={() => {
              if (activePantry.length) {
                setActiveTab('pantry');
                return;
              }

              openNewPantry();
            }}
            title={activePantry.length ? 'No stocked items' : 'Pantry is empty'}
          />
        )}
      </SectionCard>

      <SectionCard subtitle="Reusable pantry-based meals that log as one grouped entry." title="Saved meals">
        <View className="mb-1">
          <PrimaryButton label="Create custom meal" onPress={openNewCustomMeal} />
        </View>
        {customMeals.length ? (
          <View className="gap-3">
            {customMeals.map((meal) => {
              const summary = summarizeCustomMeal(meal);
              const availability = getCustomMealAvailability(meal, pantryItems);

              return (
                <View
                  className={`rounded-2xl border border-moss/10 px-4 py-4 ${availability.isAvailable ? 'bg-oat' : 'bg-oat/70 opacity-75'}`}
                  key={meal.id}
                >
                  <View className="flex-row items-start justify-between gap-4">
                    <View className="flex-1">
                      <Text className="text-base font-semibold text-ink">{meal.name}</Text>
                      <Text className="mt-1 text-sm text-ink/60">
                        {summary.ingredientCount} ingredient(s) • {formatCalories(summary.calories)} • {formatProtein(summary.protein)}
                      </Text>
                      {!availability.isAvailable ? (
                        <Text className="mt-2 text-sm text-clay">
                          {availability.hasArchivedIngredients
                            ? `${availability.unavailableReason} Edit it before logging again.`
                            : `${availability.unavailableReason} Restock or edit it before logging again.`}
                        </Text>
                      ) : summary.hasProblem ? (
                        <Text className="mt-2 text-sm text-clay">Some ingredients are missing. Edit this meal before logging again.</Text>
                      ) : null}
                    </View>
                    <View className="w-28 gap-2">
                      <PrimaryButton
                        disabled={!availability.isAvailable}
                        label="Log"
                        onPress={() => openCustomMealLog(meal)}
                      />
                      <PrimaryButton label="Edit" onPress={() => openEditCustomMeal(meal)} variant="ghost" />
                      <PrimaryButton
                        label={pendingDeleteMealId === meal.id ? 'Confirm' : 'Delete'}
                        onPress={() => deleteCurrentCustomMeal(meal)}
                        variant="danger"
                      />
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <EmptyState
            actionLabel="Build first meal"
            description="Save a meal made of pantry ingredients so you can log the whole combo in one step later."
            onPress={openNewCustomMeal}
            title="No saved meals yet"
          />
        )}
      </SectionCard>

      <SectionCard subtitle="Fallback for anything not already in the pantry." title="Manual entry">
        <PrimaryButton
          label="Add custom log"
          onPress={() => {
            setLogForm(emptyFoodLogForm());
            setLogModalOpen(true);
          }}
          variant="secondary"
        />
      </SectionCard>
    </View>
  );

  const renderPantry = () => (
    <View className="gap-4">
      <SectionCard subtitle="Staples should be easy to add, easy to tweak, and easy to hide." title="Your pantry">
        <View className="mb-1">
          <PrimaryButton label="Add pantry item" onPress={openNewPantry} />
        </View>
        {sortedPantryItems.length ? (
          <View className="gap-3">
            {sortedPantryItems.map((item) => {
              const expiryStatus = getExpiryStatus(item.expires_on);
              const expiryTone = expiryStatus.isExpired || expiryStatus.isToday
                ? 'text-clay'
                : expiryStatus.isSoon
                  ? 'text-pine'
                  : 'text-ink/55';

              return (
                <View className="rounded-2xl border border-moss/10 bg-oat px-4 py-4" key={item.id}>
                  <View className="flex-row items-start justify-between gap-4">
                    <View className="flex-1">
                      <Text className="text-base font-semibold text-ink">{item.name}</Text>
                      <Text className="mt-1 text-sm leading-5 text-ink/65">
                        {item.default_serving} • {formatCalories(item.calories_per_serving)} • {formatProtein(item.protein_per_serving)}
                      </Text>
                      <Text className="mt-1 text-sm text-moss">
                        {formatAmountWithUnit(item.stock_amount, item.serving_unit)} in stock • {formatInventoryNumber(getServingsInStock(item))} servings available
                      </Text>
                      <Text className="mt-1 text-sm text-moss">
                        {item.quantity_label} • {item.is_active ? 'Active' : 'Archived'}
                      </Text>
                      {expiryStatus.label ? (
                        <Text className={`mt-1 text-sm ${expiryTone}`}>
                          {expiryStatus.label}
                        </Text>
                      ) : (
                        <Text className="mt-1 text-sm text-ink/55">No expiry set</Text>
                      )}
                      <Text className="mt-1 text-sm text-ink/55">
                        {item.category} • {formatEffortLabel(item.effort_level)} • {item.meal_role}
                      </Text>
                    </View>
                    <View className="w-28 gap-2">
                      <PrimaryButton label="Edit" onPress={() => openEditPantry(item)} variant="ghost" />
                      <PrimaryButton
                        label="Clear stock"
                        onPress={() => clearPantryStock(item)}
                        variant="outline"
                      />
                      <PrimaryButton
                        label={item.is_active ? 'Archive' : 'Restore'}
                        onPress={() => togglePantryItem(item)}
                        variant={item.is_active ? 'danger' : 'secondary'}
                      />
                      <PrimaryButton
                        label="Delete"
                        onPress={() => setPendingDeletePantryItem(item)}
                        variant="ghost"
                      />
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <EmptyState
            actionLabel="Create first item"
            description="Think chicken breast, yogurt, eggs, peanut butter, bread, rice, tinned fish."
            onPress={openNewPantry}
            title="No pantry items yet"
          />
        )}
      </SectionCard>
    </View>
  );

  const renderSuggestions = () => (
    <View className="gap-4">
      <SectionCard
        subtitle="Deterministic, pantry-based suggestions that favor realistic low-effort combinations over macro-perfect weirdness."
        title="What can I eat next?"
      >
        <View className="rounded-2xl bg-pine px-4 py-4">
          <Text className="text-sm uppercase tracking-[1.5px] text-white/70">Remaining today</Text>
          <Text className="mt-2 font-display text-3xl text-white">
            {todaySummary.remainingCalories} cal / {todaySummary.remainingProtein}g protein
          </Text>
        </View>
        {suggestionResult.caveats.length ? (
          <View className="gap-2 rounded-2xl bg-oat px-4 py-4">
            {suggestionResult.caveats.map((caveat) => (
              <Text className="text-sm leading-5 text-ink/65" key={caveat}>
                {caveat}
              </Text>
            ))}
          </View>
        ) : (
          <Text className="text-sm leading-5 text-ink/65">
            Suggestions are built only from active pantry items and ranked for effort, coherence, and what you still have left today.
          </Text>
        )}
        <View className="gap-2">
          <Text className="text-sm font-medium text-ink/70">Priority</Text>
          <View className="flex-row flex-wrap gap-2">
            {suggestionPriorityOptions.map((option) => (
              <Pressable
                className={`rounded-full border px-3 py-2 ${suggestionPriority === option.value ? 'border-pine bg-pine' : 'border-moss/20 bg-white'}`}
                key={option.value}
                onPress={() => setSuggestionPriority(option.value)}
              >
                <Text className={`text-sm font-medium ${suggestionPriority === option.value ? 'text-white' : 'text-ink/70'}`}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text className="text-sm leading-5 text-ink/65">{suggestionPriorityDescriptions[suggestionPriority]}</Text>
        </View>
        <Text className="text-sm leading-5 text-ink/65">
          Showing 3 good options from your pantry right now. Refresh to cycle through other valid combinations.
        </Text>
        <PrimaryButton
          label={suggestionResult.suggestions.length ? 'Suggest again' : 'Refresh suggestions'}
          onPress={suggestAgain}
          variant="secondary"
        />
      </SectionCard>

      {suggestionResult.suggestions.length ? (
        suggestionResult.suggestions.map((suggestion) => (
          <SectionCard key={suggestion.id} subtitle={suggestion.description} title={suggestion.title}>
            {suggestion.expiryWarning ? (
              <View className="self-start rounded-2xl border border-clay/20 bg-clay/10 px-3 py-2">
                <Text className="text-xs font-semibold leading-5 text-clay">{suggestion.expiryWarning}</Text>
              </View>
            ) : null}
            <View className="flex-row flex-wrap gap-2">
              <InfoPill label={formatCalories(suggestion.estimatedCalories)} />
              <InfoPill label={formatProtein(suggestion.estimatedProtein)} />
              <InfoPill label={formatEffortLabel(suggestion.effortLevel)} />
            </View>
            <View className="gap-2">
              <Text className="text-sm font-semibold uppercase tracking-[1px] text-ink/55">Ingredients</Text>
              <Text className="text-sm leading-5 text-ink/75">{suggestion.ingredients.join(' • ')}</Text>
            </View>
            <View className="rounded-2xl bg-oat px-4 py-4">
              <Text className="text-sm font-semibold text-ink">Why this fits</Text>
              <Text className="mt-2 text-sm leading-5 text-ink/70">{suggestion.reason}</Text>
            </View>
            {suggestion.caveats.length ? (
              <View className="gap-2">
                {suggestion.caveats.map((caveat) => (
                  <Text className="text-sm leading-5 text-clay" key={caveat}>
                    {caveat}
                  </Text>
                ))}
              </View>
            ) : null}
            <View className="flex-row gap-3">
              <View className="flex-1">
                <PrimaryButton
                  label="Log this meal"
                  onPress={() => openSuggestionLog(suggestion)}
                />
              </View>
              <View className="flex-1">
                <PrimaryButton
                  disabled={submitting || savedMealCanonicalKeys.has(suggestion.canonicalKey)}
                  label={savedMealCanonicalKeys.has(suggestion.canonicalKey) ? 'Saved' : 'Save meal'}
                  onPress={() => {
                    void saveSuggestionMeal(suggestion);
                  }}
                  variant={savedMealCanonicalKeys.has(suggestion.canonicalKey) ? 'outline' : 'secondary'}
                />
              </View>
            </View>
            <View className="flex-row gap-3">
              <View className="flex-1">
                <PrimaryButton
                  label="Not feeling it"
                  onPress={() =>
                    setDismissedSuggestionIds((current) => Array.from(new Set([...current, suggestion.canonicalKey])))
                  }
                  variant="ghost"
                />
              </View>
            </View>
          </SectionCard>
        ))
      ) : suggestionResult.emptyState ? (
        <EmptyState
          actionLabel={
            suggestionResult.emptyState.title === 'Targets needed first'
              ? 'Open today'
              : activePantry.length
                ? 'Open pantry'
                : 'Add pantry item'
          }
          description={suggestionResult.emptyState.description}
          onPress={() => {
            if (suggestionResult.emptyState?.title === 'Targets needed first') {
              setActiveTab('today');
              return;
            }

            if (activePantry.length) {
              setActiveTab('pantry');
              return;
            }

            openNewPantry();
          }}
          title={suggestionResult.emptyState.title}
        />
      ) : null}
    </View>
  );

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'log':
        return renderLog();
      case 'pantry':
        return renderPantry();
      case 'suggestions':
        return renderSuggestions();
      default:
        return renderToday();
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-oat">
      <View className="flex-1">
        <View className="px-5 pb-3 pt-4">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="font-display text-4xl text-pine">Graze</Text>
              <Text className="mt-1 text-sm text-ink/65">
                {user?.primaryEmailAddress?.emailAddress ?? 'Signed in'}
              </Text>
            </View>
            <Pressable onPress={() => signOut()}>
              <Text className="text-sm font-semibold text-clay">Sign out</Text>
            </Pressable>
          </View>
          <View className="mt-5 flex-row rounded-full bg-white p-1">
            {tabs.map((tab) => (
              <Pressable
                className={`flex-1 rounded-full px-3 py-3 ${activeTab === tab.key ? 'bg-pine' : ''}`}
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
              >
                <Text
                  className={`text-center text-sm font-semibold ${activeTab === tab.key ? 'text-white' : 'text-ink/65'}`}
                >
                  {tab.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <ScrollView contentContainerClassName="gap-4 px-5 pb-24 pt-2">
          {error ? (
            <View className="rounded-2xl border border-clay/20 bg-white px-4 py-3">
              <Text className="text-sm leading-5 text-clay">{error}</Text>
            </View>
          ) : null}

          {renderActiveTab()}

          <PrimaryButton
            disabled={refreshing}
            label={refreshing ? 'Refreshing...' : 'Refresh from Supabase'}
            onPress={() => refresh()}
            variant="ghost"
          />
        </ScrollView>
      </View>

      <ModalSheet
        onClose={() => {
          setPantryModalOpen(false);
          setEditingItem(null);
        }}
        open={pantryModalOpen}
        title={editingItem ? 'Edit pantry item' : 'Add pantry item'}
      >
        <SheetStack>
          <Field
            label="Name"
            onChangeText={(text) => setPantryForm((current) => ({ ...current, name: text }))}
            placeholder="Greek yogurt"
            value={pantryForm.name}
          />
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field
                blurOnSubmit
                keyboardType="numeric"
                label="Serving amount"
                onChangeText={(text) => setPantryForm((current) => ({ ...current, servingAmount: text }))}
                placeholder="1.5"
                returnKeyType="done"
                value={pantryForm.servingAmount}
              />
            </View>
            <View className="flex-1 gap-2">
              <OptionGroup
                label="Serving unit"
                onChange={(servingUnit) => setPantryForm((current) => ({ ...current, servingUnit }))}
                options={pantryUnitOptions}
                value={pantryForm.servingUnit}
              />
            </View>
          </View>
          <OptionGroup
            label="Stock entry"
            onChange={(stockEntryMode) => setPantryForm((current) => ({ ...current, stockEntryMode }))}
            options={stockEntryOptions}
            value={pantryForm.stockEntryMode}
          />
          <Field
            keyboardType="numeric"
            label={pantryForm.stockEntryMode === 'amount' ? `Amount in stock (${formatUnitLabel(pantryForm.servingUnit, 2)})` : 'Servings in stock'}
            onChangeText={(text) =>
              setPantryForm((current) => ({
                ...current,
                [current.stockEntryMode === 'amount' ? 'stockAmount' : 'stockServings']: text,
              }))
            }
            placeholder={pantryForm.stockEntryMode === 'amount' ? '12' : '8'}
            value={pantryForm.stockEntryMode === 'amount' ? pantryForm.stockAmount : pantryForm.stockServings}
          />
          <Text className="text-sm leading-5 text-ink/60">
            Default serving: {formatAmountWithUnit(Number(pantryForm.servingAmount || '0'), pantryForm.servingUnit)}
          </Text>
          <Field
            autoCapitalize="none"
            label="Expiry date (optional)"
            onChangeText={(text) => setPantryForm((current) => ({ ...current, expiresOn: text }))}
            placeholder="YYYY-MM-DD"
            value={pantryForm.expiresOn}
          />
          {pantryForm.expiresOn.trim() ? (
            <PrimaryButton
              label="Clear expiry"
              onPress={() => setPantryForm((current) => ({ ...current, expiresOn: '' }))}
              variant="ghost"
            />
          ) : (
            <Text className="text-sm leading-5 text-ink/60">
              Leave blank if you do not want Graze to track an expiry date for this item yet.
            </Text>
          )}
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field
                blurOnSubmit
                keyboardType="numeric"
                label="Calories"
                onChangeText={(text) => setPantryForm((current) => ({ ...current, caloriesPerServing: text }))}
                placeholder="220"
                returnKeyType="done"
                value={pantryForm.caloriesPerServing}
              />
            </View>
            <View className="flex-1">
              <Field
                blurOnSubmit
                keyboardType="numeric"
                label="Protein (g)"
                onChangeText={(text) => setPantryForm((current) => ({ ...current, proteinPerServing: text }))}
                placeholder="18"
                returnKeyType="done"
                value={pantryForm.proteinPerServing}
              />
            </View>
          </View>
          <Field
            label="Quantity note"
            onChangeText={(text) => setPantryForm((current) => ({ ...current, quantityLabel: text }))}
            placeholder="Usually keep 2 tubs"
            value={pantryForm.quantityLabel}
          />
          <OptionGroup
            label="Category"
            onChange={(category) => setPantryForm((current) => ({ ...current, category }))}
            options={pantryCategoryOptions}
            value={pantryForm.category}
          />
          <OptionGroup
            label="Effort"
            onChange={(effortLevel) => setPantryForm((current) => ({ ...current, effortLevel }))}
            options={effortOptions}
            value={pantryForm.effortLevel}
          />
          <OptionGroup
            label="Meal role"
            onChange={(mealRole) => setPantryForm((current) => ({ ...current, mealRole }))}
            options={mealRoleOptions}
            value={pantryForm.mealRole}
          />
          <PrimaryButton
            disabled={submitting}
            label={submitting ? 'Saving...' : editingItem ? 'Save changes' : 'Create item'}
            onPress={submitPantry}
          />
        </SheetStack>
      </ModalSheet>

      <ModalSheet
        onClose={() => setPendingDeletePantryItem(null)}
        open={Boolean(pendingDeletePantryItem)}
        title="Delete pantry item"
      >
        {pendingDeletePantryItem ? (
          <SheetStack>
            <SheetSurface className="rounded-2xl bg-white px-4 py-4">
              <Text className="text-base font-semibold text-ink">{pendingDeletePantryItem.name}</Text>
              <Text className="mt-2 text-sm leading-5 text-ink/70">
                Deleting this item will permanently remove it from Pantry. Past food logs will keep the item name for history.
              </Text>
            </SheetSurface>
            <View className="gap-2 rounded-2xl bg-oat px-4 py-4">
              <Text className="text-sm leading-5 text-clay">
                {pendingDeletePantryMealCount
                  ? `${pendingDeletePantryMealCount} saved meal${pendingDeletePantryMealCount === 1 ? '' : 's'} using this ingredient will also be deleted.`
                  : 'Saved meals are unaffected because none currently use this ingredient.'}
              </Text>
              <Text className="text-sm leading-5 text-ink/65">
                If you only want to hide this item from suggestions and quick logging, archiving it is the safer option.
              </Text>
            </View>
            <PrimaryButton
              disabled={submitting}
              label={submitting ? 'Deleting...' : 'Delete item'}
              onPress={() => {
                void confirmDeletePantry();
              }}
              variant="danger"
            />
            <PrimaryButton label="Keep item" onPress={() => setPendingDeletePantryItem(null)} variant="ghost" />
          </SheetStack>
        ) : null}
      </ModalSheet>

      <ModalSheet
        onClose={() => {
          setLogModalOpen(false);
          setLogForm(emptyFoodLogForm());
        }}
        open={logModalOpen}
        title="Log food"
      >
        <SheetStack>
          {!logForm.pantryItemId ? (
            <Field
              label="Food name"
              onChangeText={(text) => setLogForm((current) => ({ ...current, customName: text }))}
              placeholder="Eggs and toast"
              value={logForm.customName}
            />
          ) : (
            <SheetSurface className="rounded-2xl bg-white px-4 py-3">
              <Text className="text-sm font-medium text-ink/60">Pantry item</Text>
              <Text className="mt-1 text-base font-semibold text-ink">{logForm.customName}</Text>
              {selectedPantryItem ? (
                <Text className="mt-1 text-sm text-moss">
                  {formatAmountWithUnit(selectedPantryItem.stock_amount, selectedPantryItem.serving_unit)} available
                </Text>
              ) : null}
            </SheetSurface>
          )}
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field
                blurOnSubmit
                keyboardType="numeric"
                label="Servings"
                onChangeText={(text) => setLogForm((current) => ({ ...current, servings: text }))}
                placeholder="1"
                returnKeyType="done"
                value={logForm.servings}
              />
            </View>
            <View className="flex-1">
              <Field
                blurOnSubmit
                keyboardType="numeric"
                label="Calories"
                onChangeText={(text) => setLogForm((current) => ({ ...current, calories: text }))}
                placeholder="450"
                returnKeyType="done"
                value={logForm.calories}
              />
            </View>
          </View>
          <Field
            blurOnSubmit
            keyboardType="numeric"
            label="Protein (g)"
            onChangeText={(text) => setLogForm((current) => ({ ...current, protein: text }))}
            placeholder="30"
            returnKeyType="done"
            value={logForm.protein}
          />
          {selectedPantryItem ? (
            <Field
              blurOnSubmit
              keyboardType="numeric"
              label={`Amount used (${formatUnitLabel(selectedPantryItem.serving_unit, 2)})`}
              onChangeText={(text) => setLogForm((current) => ({ ...current, amountUsed: text }))}
              placeholder={`Optional, defaults to ${formatInventoryNumber(Number(logForm.servings || '1') * selectedPantryItem.serving_amount)}`}
              returnKeyType="done"
              value={logForm.amountUsed}
            />
          ) : null}
          <Field
            label="Notes"
            multiline
            onChangeText={(text) => setLogForm((current) => ({ ...current, notes: text }))}
            placeholder="Optional context"
            value={logForm.notes}
          />
          <PrimaryButton disabled={submitting} label={submitting ? 'Saving...' : 'Save log'} onPress={submitLog} />
        </SheetStack>
      </ModalSheet>

      <ModalSheet
        onClose={closeEditLog}
        open={editLogModalOpen}
        title={editingLogEntry?.log_source === 'suggested_grouped' || editingLogEntry?.log_source === 'custom_meal_grouped' ? 'Edit meal' : 'Edit log'}
      >
        {editingLogEntry ? (
          editingLogEntry.log_source === 'suggested_grouped' || editingLogEntry.log_source === 'custom_meal_grouped' ? (
            <SheetStack>
              {loadingLogMealItems ? (
                <LoadingBlock label="Loading meal details..." />
              ) : editingLogMealItems.length ? (
                <SheetStack>
                  <Field
                    label="Meal title"
                    onChangeText={(text) => setEditGroupedLogForm((current) => ({ ...current, title: text }))}
                    placeholder="Tuna + crackers"
                    value={editGroupedLogForm.title}
                  />
                  <Field
                    blurOnSubmit
                    keyboardType="numeric"
                    label="Meal servings"
                    onChangeText={(text) => setEditGroupedLogForm((current) => ({ ...current, mealServings: text }))}
                    placeholder="1"
                    returnKeyType="done"
                    value={editGroupedLogForm.mealServings}
                  />
                  <SheetStack className="gap-3">
                    <Text className="text-sm font-semibold uppercase tracking-[1px] text-ink/55">Ingredients</Text>
                    {editGroupedLogForm.ingredients.map((ingredient, index) => {
                      const pantryItem = pantryItems.find((item) => item.id === ingredient.pantryItemId) ?? null;
                      const resolvedIngredient = groupedLogResolvedIngredients.find((item) => item.pantryItem.id === ingredient.pantryItemId);

                      return (
                        <SheetSurface className="rounded-2xl bg-white px-4 py-4" key={`grouped-ingredient-${index}`}>
                          <View className="flex-row items-start justify-between gap-4">
                            <View className="flex-1">
                              <Text className="text-sm font-medium text-ink/60">Ingredient {index + 1}</Text>
                              <Text className="mt-1 text-base font-semibold text-ink">
                                {pantryItem?.name ?? 'Choose pantry item'}
                              </Text>
                              {resolvedIngredient ? (
                                <Text className="mt-1 text-sm text-moss">
                                  Total now: {formatAmountWithUnit(resolvedIngredient.totalAmountUsed, pantryItem?.serving_unit ?? 'serving')}
                                </Text>
                              ) : pantryItem ? (
                                <Text className="mt-1 text-sm text-moss">
                                  {formatAmountWithUnit(pantryItem.stock_amount, pantryItem.serving_unit)} currently in stock
                                </Text>
                              ) : null}
                            </View>
                            <View className="w-28 gap-2">
                              <PrimaryButton
                                label={pantryItem ? 'Change' : 'Choose'}
                                onPress={() => setEditGroupedLogPickerIndex(index)}
                                variant="ghost"
                              />
                              <PrimaryButton
                                label="Remove"
                                onPress={() => removeGroupedLogIngredient(index)}
                                variant="outline"
                              />
                            </View>
                          </View>
                          <View className="mt-4">
                            <Field
                              blurOnSubmit
                              keyboardType="numeric"
                              label={pantryItem ? `Amount per meal serving (${formatUnitLabel(pantryItem.serving_unit, 2)})` : 'Amount per meal serving'}
                              onChangeText={(text) => updateGroupedLogIngredient(index, { amountUsedPerServing: text })}
                              placeholder="1"
                              returnKeyType="done"
                              value={ingredient.amountUsedPerServing}
                            />
                          </View>
                          {resolvedIngredient ? (
                            <Text className="mt-2 text-sm text-ink/65">
                              {formatCalories(Math.round(resolvedIngredient.calories))} • {formatProtein(Math.round(resolvedIngredient.protein))}
                            </Text>
                          ) : null}
                          {editGroupedLogPickerIndex === index ? (
                            <View className="mt-4 gap-3 rounded-2xl border border-moss/10 bg-oat px-4 py-4">
                              <View className="flex-row items-center justify-between gap-3">
                                <Text className="text-sm font-semibold uppercase tracking-[1px] text-ink/55">
                                  Choose pantry item
                                </Text>
                                <Pressable onPress={() => setEditGroupedLogPickerIndex(null)}>
                                  <Text className="text-sm font-semibold text-clay">Done</Text>
                                </Pressable>
                              </View>
                              {activePantry.length ? (
                                <View className="gap-2">
                                  {activePantry.map((item) => {
                                    const isSelected = ingredient.pantryItemId === item.id;

                                    return (
                                      <Pressable
                                        className={`rounded-2xl border px-4 py-3 ${isSelected ? 'border-pine bg-white' : 'border-moss/10 bg-white'}`}
                                        key={item.id}
                                        onPress={() => {
                                          updateGroupedLogIngredient(index, {
                                            pantryItemId: item.id,
                                          });
                                          setEditGroupedLogPickerIndex(null);
                                        }}
                                      >
                                        <View className="flex-row items-center justify-between gap-3">
                                          <View className="flex-1">
                                            <Text className="text-base font-semibold text-ink">{item.name}</Text>
                                            <Text className="mt-1 text-sm text-ink/60">
                                              {item.default_serving} • {formatCalories(item.calories_per_serving)} • {formatProtein(item.protein_per_serving)}
                                            </Text>
                                            <Text className="mt-1 text-sm text-moss">
                                              {formatAmountWithUnit(item.stock_amount, item.serving_unit)} in stock
                                            </Text>
                                          </View>
                                          <Text className={`text-sm font-semibold ${isSelected ? 'text-pine' : 'text-ink/55'}`}>
                                            {isSelected ? 'Selected' : 'Use'}
                                          </Text>
                                        </View>
                                      </Pressable>
                                    );
                                  })}
                                </View>
                              ) : (
                                <EmptyState
                                  actionLabel="Open pantry"
                                  description="Add and activate pantry items before you edit grouped meals."
                                  onPress={() => {
                                    setEditGroupedLogPickerIndex(null);
                                    setEditLogModalOpen(false);
                                    setActiveTab('pantry');
                                  }}
                                  title="No active pantry items"
                                />
                              )}
                            </View>
                          ) : null}
                        </SheetSurface>
                      );
                    })}
                  </SheetStack>
                  <PrimaryButton label="Add ingredient" onPress={addGroupedLogIngredient} variant="secondary" />
                  <SheetSurface className="rounded-2xl bg-white px-4 py-4">
                    <Text className="text-sm font-medium text-ink/60">Derived nutrition</Text>
                    <Text className="mt-1 text-base font-semibold text-ink">
                      {formatCalories(groupedLogSummary.calories)} • {formatProtein(groupedLogSummary.protein)}
                    </Text>
                    {groupedLogFormIssue ? (
                      <Text className="mt-2 text-sm leading-5 text-clay">{groupedLogFormIssue}</Text>
                    ) : null}
                  </SheetSurface>
                  {confirmDeleteLog ? (
                    <SheetSurface className="rounded-2xl bg-oat px-4 py-3">
                      <Text className="text-sm font-semibold text-clay">Tap delete again to confirm</Text>
                      <Text className="mt-1 text-sm leading-5 text-ink/65">
                        Deleting this grouped meal restores all linked ingredient stock.
                      </Text>
                    </SheetSurface>
                  ) : null}
                  <PrimaryButton
                    disabled={submitting || Boolean(groupedLogFormIssue)}
                    label={submitting ? 'Saving...' : 'Save changes'}
                    onPress={submitEditLog}
                  />
                  <PrimaryButton
                    disabled={submitting}
                    label={confirmDeleteLog ? (submitting ? 'Deleting...' : 'Confirm delete') : 'Delete meal'}
                    onPress={deleteCurrentLog}
                    variant="danger"
                  />
                </SheetStack>
              ) : (
                <SheetSurface className="rounded-2xl bg-white px-4 py-4">
                  <Text className="text-sm font-medium text-ink/60">Meal</Text>
                  <Text className="mt-1 text-base font-semibold text-ink">
                    {editingLogEntry.custom_name ?? 'Grouped meal'}
                  </Text>
                  <Text className="text-sm leading-5 text-ink/65">
                    This older grouped log does not have structured ingredient details saved yet, so it stays view-only for now.
                  </Text>
                </SheetSurface>
              )}
            </SheetStack>
          ) : (
            <SheetStack>
              {!editLogForm.pantryItemId ? (
                <Field
                  label="Food name"
                  onChangeText={(text) => setEditLogForm((current) => ({ ...current, customName: text }))}
                  placeholder="Eggs and toast"
                  value={editLogForm.customName}
                />
              ) : (
                <SheetSurface className="rounded-2xl bg-white px-4 py-3">
                  <Text className="text-sm font-medium text-ink/60">Pantry item</Text>
                  <Text className="mt-1 text-base font-semibold text-ink">{editLogForm.customName}</Text>
                  {editingLogPantryItem ? (
                    <Text className="mt-1 text-sm text-moss">
                      {formatAmountWithUnit(editingLogPantryItem.stock_amount, editingLogPantryItem.serving_unit)} available before correction
                    </Text>
                  ) : null}
                </SheetSurface>
              )}
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Field
                    blurOnSubmit
                    keyboardType="numeric"
                    label="Servings"
                    onChangeText={(text) => setEditLogForm((current) => ({ ...current, servings: text }))}
                    placeholder="1"
                    returnKeyType="done"
                    value={editLogForm.servings}
                  />
                </View>
                <View className="flex-1">
                  <Field
                    blurOnSubmit
                    keyboardType="numeric"
                    label="Calories"
                    onChangeText={(text) => setEditLogForm((current) => ({ ...current, calories: text }))}
                    placeholder="450"
                    returnKeyType="done"
                    value={editLogForm.calories}
                  />
                </View>
              </View>
              <Field
                blurOnSubmit
                keyboardType="numeric"
                label="Protein (g)"
                onChangeText={(text) => setEditLogForm((current) => ({ ...current, protein: text }))}
                placeholder="30"
                returnKeyType="done"
                value={editLogForm.protein}
              />
              {editingLogPantryItem ? (
                <Field
                  blurOnSubmit
                  keyboardType="numeric"
                  label={`Amount used (${formatUnitLabel(editingLogPantryItem.serving_unit, 2)})`}
                  onChangeText={(text) => setEditLogForm((current) => ({ ...current, amountUsed: text }))}
                  placeholder={`Optional, defaults to ${formatInventoryNumber(Number(editLogForm.servings || '1') * editingLogPantryItem.serving_amount)}`}
                  returnKeyType="done"
                  value={editLogForm.amountUsed}
                />
              ) : null}
              <Field
                label="Notes"
                multiline
                onChangeText={(text) => setEditLogForm((current) => ({ ...current, notes: text }))}
                placeholder="Optional context"
                value={editLogForm.notes}
              />
              {confirmDeleteLog ? (
                <SheetSurface className="rounded-2xl bg-oat px-4 py-3">
                  <Text className="text-sm font-semibold text-clay">Tap delete again to confirm</Text>
                  <Text className="mt-1 text-sm leading-5 text-ink/65">
                    Pantry-linked logs will restore the saved amount back to inventory.
                  </Text>
                </SheetSurface>
              ) : null}
              <PrimaryButton
                disabled={submitting}
                label={submitting ? 'Saving...' : 'Save changes'}
                onPress={submitEditLog}
              />
              <PrimaryButton
                disabled={submitting}
                label={confirmDeleteLog ? (submitting ? 'Deleting...' : 'Confirm delete') : 'Delete log'}
                onPress={deleteCurrentLog}
                variant="danger"
              />
            </SheetStack>
          )
        ) : null}
      </ModalSheet>

      <ModalSheet
        onClose={closeCustomMealModal}
        open={customMealModalOpen}
        title={editingCustomMeal ? 'Edit custom meal' : 'Create custom meal'}
      >
        <SheetStack>
          <Field
            label="Meal name"
            onChangeText={(text) => setCustomMealForm((current) => ({ ...current, name: text }))}
            placeholder="Yogurt + berries + granola"
            value={customMealForm.name}
          />
          <SheetStack className="gap-3">
            <Text className="text-sm font-semibold uppercase tracking-[1px] text-ink/55">Ingredients</Text>
            {customMealForm.ingredients.map((ingredient, index) => {
              const pantryItem = pantryItems.find((item) => item.id === ingredient.pantryItemId) ?? null;

              return (
                <SheetSurface className="rounded-2xl bg-white px-4 py-4" key={`meal-ingredient-${index}`}>
                  <View className="flex-row items-start justify-between gap-4">
                    <View className="flex-1">
                      <Text className="text-sm font-medium text-ink/60">Ingredient {index + 1}</Text>
                      <Text className="mt-1 text-base font-semibold text-ink">
                        {pantryItem?.name ?? 'Choose pantry item'}
                      </Text>
                      {pantryItem ? (
                        <Text className={`mt-1 text-sm ${pantryItem.is_active ? 'text-moss' : 'text-clay'}`}>
                          {pantryItem.is_active
                            ? `${formatAmountWithUnit(pantryItem.stock_amount, pantryItem.serving_unit)} in stock`
                            : 'Archived pantry item, choose a replacement before saving'}
                        </Text>
                      ) : null}
                    </View>
                    <View className="w-28 gap-2">
                      <PrimaryButton
                        label={pantryItem ? 'Change' : 'Choose'}
                        onPress={() => setCustomMealPickerIndex(index)}
                        variant="ghost"
                      />
                      <PrimaryButton
                        label="Remove"
                        onPress={() => removeCustomMealIngredient(index)}
                        variant="outline"
                      />
                    </View>
                  </View>
                  <View className="mt-4">
                    <Field
                      blurOnSubmit
                      keyboardType="numeric"
                      label={pantryItem ? `Amount used (${formatUnitLabel(pantryItem.serving_unit, 2)})` : 'Amount used'}
                      onChangeText={(text) => updateCustomMealIngredient(index, { amountUsed: text })}
                      placeholder="1"
                      returnKeyType="done"
                      value={ingredient.amountUsed}
                    />
                  </View>
                  {customMealPickerIndex === index ? (
                    <View className="mt-4 gap-3 rounded-2xl border border-moss/10 bg-oat px-4 py-4">
                      <View className="flex-row items-center justify-between gap-3">
                        <Text className="text-sm font-semibold uppercase tracking-[1px] text-ink/55">
                          Choose pantry item
                        </Text>
                        <Pressable onPress={() => setCustomMealPickerIndex(null)}>
                          <Text className="text-sm font-semibold text-clay">Done</Text>
                        </Pressable>
                      </View>
                      {activePantry.length ? (
                        <View className="gap-2">
                          {activePantry.map((item) => {
                            const isSelected = ingredient.pantryItemId === item.id;

                            return (
                              <Pressable
                                className={`rounded-2xl border px-4 py-3 ${isSelected ? 'border-pine bg-white' : 'border-moss/10 bg-white'}`}
                                key={item.id}
                                onPress={() => {
                                  updateCustomMealIngredient(index, {
                                    pantryItemId: item.id,
                                  });
                                  setCustomMealPickerIndex(null);
                                }}
                              >
                                <View className="flex-row items-center justify-between gap-3">
                                  <View className="flex-1">
                                    <Text className="text-base font-semibold text-ink">{item.name}</Text>
                                    <Text className="mt-1 text-sm text-ink/60">
                                      {item.default_serving} • {formatCalories(item.calories_per_serving)} • {formatProtein(item.protein_per_serving)}
                                    </Text>
                                    <Text className="mt-1 text-sm text-moss">
                                      {formatAmountWithUnit(item.stock_amount, item.serving_unit)} in stock
                                    </Text>
                                  </View>
                                  <Text className={`text-sm font-semibold ${isSelected ? 'text-pine' : 'text-ink/55'}`}>
                                    {isSelected ? 'Selected' : 'Use'}
                                  </Text>
                                </View>
                              </Pressable>
                            );
                          })}
                        </View>
                      ) : (
                        <EmptyState
                          actionLabel="Open pantry"
                          description="Add and activate pantry items before you build a reusable custom meal."
                          onPress={() => {
                            setCustomMealPickerIndex(null);
                            setCustomMealModalOpen(false);
                            setActiveTab('pantry');
                          }}
                          title="No active pantry items"
                        />
                      )}
                    </View>
                  ) : null}
                </SheetSurface>
              );
            })}
          </SheetStack>
          <PrimaryButton label="Add ingredient" onPress={addCustomMealIngredient} variant="secondary" />
          <SheetSurface className="rounded-2xl bg-white px-4 py-4">
            <Text className="text-sm font-medium text-ink/60">Derived nutrition</Text>
            <Text className="mt-1 text-base font-semibold text-ink">
              {formatCalories(mealFormSummary.calories)} • {formatProtein(mealFormSummary.protein)}
            </Text>
            <Text className="mt-2 text-sm leading-5 text-ink/65">
              Totals come directly from the linked pantry ingredients and amounts used above.
            </Text>
            {customMealFormIssue ? (
              <Text className="mt-2 text-sm leading-5 text-clay">{customMealFormIssue}</Text>
            ) : null}
          </SheetSurface>
          {pendingDeleteMealId === editingCustomMeal?.id ? (
            <SheetSurface className="rounded-2xl bg-oat px-4 py-3">
              <Text className="text-sm font-semibold text-clay">Tap delete again to confirm</Text>
            </SheetSurface>
          ) : null}
          <PrimaryButton
            disabled={submitting || Boolean(customMealFormIssue)}
            label={submitting ? 'Saving...' : editingCustomMeal ? 'Save meal' : 'Create meal'}
            onPress={submitCustomMeal}
          />
          {editingCustomMeal ? (
            <PrimaryButton
              disabled={submitting}
              label={pendingDeleteMealId === editingCustomMeal.id ? 'Confirm delete' : 'Delete meal'}
              onPress={() => deleteCurrentCustomMeal(editingCustomMeal)}
              variant="danger"
            />
          ) : null}
        </SheetStack>
      </ModalSheet>

      <ModalSheet
        onClose={() => {
          setCustomMealLogOpen(false);
          setSelectedCustomMeal(null);
          setCustomMealLogServings('1');
        }}
        open={customMealLogOpen}
        title="Log custom meal"
      >
        {selectedCustomMeal ? (
          <SheetStack>
            <SheetSurface className="rounded-2xl bg-white px-4 py-4">
              <Text className="text-sm font-medium text-ink/60">Meal</Text>
              <Text className="mt-1 text-base font-semibold text-ink">{selectedCustomMeal.name}</Text>
              <Text className="mt-2 text-sm leading-5 text-ink/65">
                Logs one grouped entry while deducting each pantry ingredient behind the scenes.
              </Text>
            </SheetSurface>
            <View className="flex-row flex-wrap gap-2">
              <InfoPill label={formatCalories(summarizeCustomMeal(selectedCustomMeal).calories * Number(customMealLogServings || '1'))} />
              <InfoPill label={formatProtein(summarizeCustomMeal(selectedCustomMeal).protein * Number(customMealLogServings || '1'))} />
            </View>
            <Field
              blurOnSubmit
              keyboardType="numeric"
              label="Meal servings"
              onChangeText={setCustomMealLogServings}
              placeholder="1"
              returnKeyType="done"
              value={customMealLogServings}
            />
            <SheetStack className="gap-2">
              <Text className="text-sm font-semibold uppercase tracking-[1px] text-ink/55">Ingredient deduction</Text>
              {selectedCustomMeal.ingredients.map((ingredient) => {
                const scaledMealServings = Number(customMealLogServings || '1');
                const scaledAmount = ingredient.amount_used * (Number.isFinite(scaledMealServings) ? scaledMealServings : 1);

                return (
                  <SheetSurface className="rounded-2xl bg-white px-4 py-3" key={ingredient.id}>
                    <Text className="text-base font-semibold text-ink">
                      {ingredient.pantry_item?.name ?? 'Pantry ingredient'}
                    </Text>
                    <Text className="mt-1 text-sm text-ink/65">
                      Uses {ingredient.pantry_item
                        ? formatAmountWithUnit(scaledAmount, ingredient.pantry_item.serving_unit)
                        : `${scaledAmount} units`}
                    </Text>
                  </SheetSurface>
                );
              })}
            </SheetStack>
            <PrimaryButton
              disabled={submitting || !validateNumber(customMealLogServings)}
              label={submitting ? 'Logging...' : 'Log meal'}
              onPress={submitCustomMealLog}
            />
          </SheetStack>
        ) : null}
      </ModalSheet>

      <ModalSheet
        onClose={() => {
          setSuggestionLogOpen(false);
          setSelectedSuggestion(null);
          setSuggestionLogForm({
            suggestionId: '',
            mealServings: '1',
          });
        }}
        open={suggestionLogOpen}
        title="Log suggested meal"
      >
        {selectedSuggestion ? (
          <SheetStack>
            <SheetSurface className="rounded-2xl bg-white px-4 py-4">
              <Text className="text-sm font-medium text-ink/60">Meal</Text>
              <Text className="mt-1 text-base font-semibold text-ink">{selectedSuggestion.title}</Text>
              <Text className="mt-2 text-sm leading-5 text-ink/65">{selectedSuggestion.description}</Text>
            </SheetSurface>
            <View className="flex-row flex-wrap gap-2">
              <InfoPill label={formatCalories(selectedSuggestion.estimatedCalories * Number(suggestionLogForm.mealServings || '1'))} />
              <InfoPill label={formatProtein(selectedSuggestion.estimatedProtein * Number(suggestionLogForm.mealServings || '1'))} />
            </View>
            <Field
              blurOnSubmit
              keyboardType="numeric"
              label="Meal servings"
              onChangeText={(text) => setSuggestionLogForm((current) => ({ ...current, mealServings: text }))}
              placeholder="1"
              returnKeyType="done"
              value={suggestionLogForm.mealServings}
            />
            <SheetStack className="gap-2">
              <Text className="text-sm font-semibold uppercase tracking-[1px] text-ink/55">Ingredient deduction</Text>
              {selectedSuggestion.ingredientDetails.map((ingredient) => {
                const scaledMealServings = Number(suggestionLogForm.mealServings || '1');
                const scaledAmount = ingredient.stockAmountRequired * (Number.isFinite(scaledMealServings) ? scaledMealServings : 1);

                return (
                  <SheetSurface className="rounded-2xl bg-white px-4 py-3" key={ingredient.pantryItemId}>
                    <Text className="text-base font-semibold text-ink">{ingredient.name}</Text>
                    <Text className="mt-1 text-sm text-ink/65">
                      Uses {formatAmountWithUnit(scaledAmount, ingredient.servingUnit)}
                    </Text>
                  </SheetSurface>
                );
              })}
            </SheetStack>
            <PrimaryButton
              disabled={submitting || !validateNumber(suggestionLogForm.mealServings)}
              label={submitting ? 'Logging...' : 'Log meal'}
              onPress={submitSuggestionLog}
            />
          </SheetStack>
        ) : null}
      </ModalSheet>
    </SafeAreaView>
  );
}

function MetricCard({
  label,
  progress,
  remaining,
  value,
}: {
  label: string;
  progress: number;
  remaining: number;
  value: number;
}) {
  return (
    <View className="flex-1 rounded-2xl bg-oat px-4 py-4">
      <Text className="text-sm font-medium uppercase tracking-[1px] text-ink/55">{label}</Text>
      <Text className="mt-2 font-display text-3xl text-pine">{value}</Text>
      <View className="mt-3 h-2 overflow-hidden rounded-full bg-white">
        <View className="h-full rounded-full bg-clay" style={{ width: `${progress}%` }} />
      </View>
      <Text className="mt-3 text-sm text-ink/65">{remaining} left today</Text>
    </View>
  );
}

function EmptyState({
  title,
  description,
  actionLabel,
  onPress,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onPress: () => void;
}) {
  return (
    <View className="items-start gap-3 rounded-2xl border border-dashed border-moss/20 bg-oat px-4 py-5">
      <Text className="text-base font-semibold text-ink">{title}</Text>
      <Text className="text-sm leading-5 text-ink/65">{description}</Text>
      <PrimaryButton label={actionLabel} onPress={onPress} variant="secondary" />
    </View>
  );
}

function InfoPill({ label }: { label: string }) {
  return (
    <Text className="rounded-full bg-butter px-3 py-1 text-xs font-semibold uppercase text-ink">
      {label}
    </Text>
  );
}

function OptionGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View className="gap-2">
      <Text className="text-sm font-medium text-ink/70">{label}</Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => (
          <Pressable
            className={`rounded-full border px-3 py-2 ${value === option.value ? 'border-pine bg-pine' : 'border-moss/20 bg-white'}`}
            key={option.value}
            onPress={() => onChange(option.value)}
          >
            <Text className={`text-sm font-medium ${value === option.value ? 'text-white' : 'text-ink/70'}`}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
