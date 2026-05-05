import type {
  FoodLogEntry,
  PantryCategory,
  PantryEffortLevel,
  PantryItem,
  PantryMealRole,
  Profile,
  Suggestion,
  SuggestionEngineResult,
  SuggestionGoal,
  TodaySummary,
} from '../types';
import { buildDefaultServingLabel } from '../lib/inventory';
import { hasAtLeastOneServingInStock } from '../lib/inventory';

type SuggestionContext = {
  pantryItems: PantryItem[];
  todayLogs: FoodLogEntry[];
  profile: Profile | null;
  todaySummary: TodaySummary;
  now: Date;
  goal?: SuggestionGoal;
  excludedSuggestionIds?: string[];
  variationSeed?: number;
};

type CandidatePattern =
  | 'protein-carb'
  | 'protein-fruit'
  | 'dairy-fruit'
  | 'dairy-fruit-fat'
  | 'base-protein-condiment'
  | 'snack-protein'
  | 'late-night';

type Candidate = {
  id: string;
  title: string;
  description: string;
  ingredients: PantryItem[];
  estimatedCalories: number;
  estimatedProtein: number;
  estimatedPrepTimeMinutes: number;
  effortLevel: PantryEffortLevel;
  reason: string;
  caveats: string[];
  pattern: CandidatePattern;
  coherenceScore: number;
};

type DayPart = 'morning' | 'midday' | 'evening' | 'late-night';

const effortRank: Record<PantryEffortLevel, number> = {
  no_prep: 0,
  assemble: 1,
  microwave: 2,
  cook: 3,
};

const prepMinutesByEffort: Record<PantryEffortLevel, number> = {
  no_prep: 1,
  assemble: 3,
  microwave: 5,
  cook: 12,
};

const categoryKeywords: Record<PantryCategory, string[]> = {
  protein: ['chicken', 'turkey', 'egg', 'eggs', 'tuna', 'salmon', 'sardine', 'beef', 'protein', 'tofu', 'beans'],
  carb: ['bread', 'toast', 'rice', 'oats', 'bagel', 'pasta', 'wrap', 'tortilla', 'potato', 'cereal'],
  fat: ['peanut butter', 'almond butter', 'nuts', 'trail mix', 'avocado', 'olive oil'],
  fruit: ['banana', 'apple', 'berries', 'berry', 'orange', 'grapes', 'fruit'],
  vegetable: ['pepper', 'spinach', 'broccoli', 'carrot', 'vegetable', 'salad', 'cucumber'],
  dairy: ['yogurt', 'milk', 'cheese', 'cottage cheese'],
  condiment: ['mayo', 'mustard', 'hot sauce', 'jam', 'hummus', 'salsa', 'soy sauce', 'ketchup'],
  snack: ['cracker', 'popcorn', 'bar', 'chips', 'granola', 'pretzel'],
  other: [],
};

const roleKeywords: Record<PantryMealRole, string[]> = {
  main: [],
  base: ['bread', 'toast', 'rice', 'oats', 'bagel', 'wrap', 'tortilla', 'pasta'],
  topping: ['cheese', 'berries', 'banana', 'nuts'],
  condiment: ['mayo', 'mustard', 'hot sauce', 'jam', 'hummus', 'salsa', 'soy sauce', 'ketchup'],
  snack: ['cracker', 'chips', 'bar', 'popcorn', 'pretzel'],
};

const effortKeywords: Record<PantryEffortLevel, string[]> = {
  no_prep: ['yogurt', 'banana', 'apple', 'berries', 'bar', 'trail mix', 'protein shake'],
  assemble: ['bread', 'toast', 'peanut butter', 'tuna', 'cracker', 'bagel', 'hummus'],
  microwave: ['rice', 'oats', 'leftover', 'soup'],
  cook: ['chicken', 'egg', 'eggs', 'pasta', 'beef', 'salmon'],
};

const goalProteinFloor = {
  balanced: 12,
  bulk: 18,
};

const addUniqueCandidate = (candidates: Candidate[], candidate: Candidate) => {
  if (candidates.some((entry) => entry.id === candidate.id)) {
    return;
  }

  candidates.push(candidate);
};

const normalizeName = (value: string) => value.trim().toLowerCase();

const inferredCategory = (item: PantryItem) => {
  if (item.category !== 'other') {
    return item.category;
  }

  const name = normalizeName(item.name);

  for (const [category, keywords] of Object.entries(categoryKeywords) as [PantryCategory, string[]][]) {
    if (keywords.some((keyword) => name.includes(keyword))) {
      return category;
    }
  }

  if (item.protein_per_serving >= 18) {
    return 'protein';
  }

  if (item.calories_per_serving >= 180 && item.protein_per_serving <= 6) {
    return 'carb';
  }

  return 'other';
};

const inferredMealRole = (item: PantryItem) => {
  if (item.meal_role !== 'main') {
    return item.meal_role;
  }

  const name = normalizeName(item.name);

  for (const [role, keywords] of Object.entries(roleKeywords) as [PantryMealRole, string[]][]) {
    if (keywords.some((keyword) => name.includes(keyword))) {
      return role;
    }
  }

  return 'main';
};

const inferredEffort = (item: PantryItem) => {
  if (item.effort_level !== 'assemble') {
    return item.effort_level;
  }

  const name = normalizeName(item.name);

  for (const [effort, keywords] of Object.entries(effortKeywords) as [PantryEffortLevel, string[]][]) {
    if (keywords.some((keyword) => name.includes(keyword))) {
      return effort;
    }
  }

  return 'assemble';
};

const getDayPart = (now: Date): DayPart => {
  const hour = now.getHours();

  if (hour < 11) {
    return 'morning';
  }

  if (hour < 16) {
    return 'midday';
  }

  if (hour < 22) {
    return 'evening';
  }

  return 'late-night';
};

const getLogNames = (todayLogs: FoodLogEntry[]) =>
  todayLogs.map((entry) => normalizeName(entry.pantry_item?.name ?? entry.custom_name ?? ''));

const buildReason = (
  title: string,
  summary: TodaySummary,
  dayPart: DayPart,
  effortLevel: PantryEffortLevel,
) => {
  const reasonParts: string[] = [];

  if (summary.remainingProtein > summary.remainingCalories / 18) {
    reasonParts.push('you still have a meaningful protein gap');
  } else if (summary.remainingCalories > 500) {
    reasonParts.push('you still have room for a solid bite');
  } else {
    reasonParts.push('it keeps the next meal light and manageable');
  }

  if (dayPart === 'late-night' || dayPart === 'morning') {
    reasonParts.push('the low-friction format fits the time of day');
  }

  if (effortLevel === 'no_prep' || effortLevel === 'assemble') {
    reasonParts.push('it does not ask you to properly cook');
  }

  return `${title} works because ${reasonParts.join(', ')}.`;
};

const buildCandidate = (
  pattern: CandidatePattern,
  items: PantryItem[],
  description: string,
  dayPart: DayPart,
  summary: TodaySummary,
): Candidate => {
  const effortLevel = items.reduce<PantryEffortLevel>((highest, item) => {
    const itemEffort = inferredEffort(item);
    return effortRank[itemEffort] > effortRank[highest] ? itemEffort : highest;
  }, 'no_prep');
  const estimatedCalories = items.reduce((sum, item) => sum + item.calories_per_serving, 0);
  const estimatedProtein = items.reduce((sum, item) => sum + item.protein_per_serving, 0);
  const ingredientNames = items.map((item) => item.name);
  const title = ingredientNames.join(' + ');

  return {
    id: `${pattern}:${ingredientNames.map(normalizeName).sort().join('|')}`,
    title,
    description,
    ingredients: items,
    estimatedCalories,
    estimatedProtein,
    estimatedPrepTimeMinutes: prepMinutesByEffort[effortLevel],
    effortLevel,
    reason: buildReason(title, summary, dayPart, effortLevel),
    caveats: [],
    pattern,
    coherenceScore: Math.max(0, 10 - items.length),
  };
};

const hasAnyKeyword = (name: string, keywords: string[]) => keywords.some((keyword) => name.includes(keyword));

const classifyItems = (items: PantryItem[]) => {
  const groups = {
    proteins: [] as PantryItem[],
    carbs: [] as PantryItem[],
    fruits: [] as PantryItem[],
    dairy: [] as PantryItem[],
    snacks: [] as PantryItem[],
    condiments: [] as PantryItem[],
    fats: [] as PantryItem[],
    other: [] as PantryItem[],
  };

  items.forEach((item) => {
    const category = inferredCategory(item);

    switch (category) {
      case 'protein':
        groups.proteins.push(item);
        break;
      case 'carb':
        groups.carbs.push(item);
        break;
      case 'fruit':
        groups.fruits.push(item);
        break;
      case 'dairy':
        groups.dairy.push(item);
        break;
      case 'snack':
        groups.snacks.push(item);
        break;
      case 'condiment':
        groups.condiments.push(item);
        break;
      case 'fat':
        groups.fats.push(item);
        break;
      default:
        groups.other.push(item);
    }
  });

  return groups;
};

const generateCandidates = (
  items: PantryItem[],
  dayPart: DayPart,
  summary: TodaySummary,
) => {
  const candidates: Candidate[] = [];
  const groups = classifyItems(items);

  groups.proteins.forEach((protein) => {
    groups.carbs.forEach((carb) => {
      addUniqueCandidate(
        candidates,
        buildCandidate('protein-carb', [protein, carb], 'A simple protein-and-carb combo built from pantry staples.', dayPart, summary),
      );
    });

    groups.fruits.forEach((fruit) => {
      addUniqueCandidate(
        candidates,
        buildCandidate('protein-fruit', [protein, fruit], 'A lighter combo when you want protein without a full meal.', dayPart, summary),
      );
    });

    groups.snacks.forEach((snack) => {
      addUniqueCandidate(
        candidates,
        buildCandidate('snack-protein', [snack, protein], 'A fast snack-plus-protein pairing that still feels normal.', dayPart, summary),
      );
    });
  });

  groups.dairy.forEach((dairy) => {
    groups.fruits.forEach((fruit) => {
      addUniqueCandidate(
        candidates,
        buildCandidate('dairy-fruit', [dairy, fruit], 'Cold, quick, and easy to eat without much setup.', dayPart, summary),
      );
    });

    groups.fruits.forEach((fruit) => {
      groups.fats.forEach((fat) => {
        addUniqueCandidate(
          candidates,
          buildCandidate('dairy-fruit-fat', [dairy, fruit, fat], 'A more filling bowl-style option using normal pantry pairings.', dayPart, summary),
        );
      });
    });
  });

  groups.carbs.forEach((base) => {
    groups.proteins.forEach((protein) => {
      groups.condiments.forEach((condiment) => {
        addUniqueCandidate(
          candidates,
          buildCandidate(
            'base-protein-condiment',
            [base, protein, condiment],
            'A straightforward base-plus-protein meal with one flavor booster.',
            dayPart,
            summary,
          ),
        );
      });
    });
  });

  if (dayPart === 'late-night') {
    [...groups.dairy, ...groups.snacks, ...groups.fruits]
      .filter((item) => effortRank[inferredEffort(item)] <= effortRank.assemble)
      .forEach((item) => {
        addUniqueCandidate(
          candidates,
          buildCandidate('late-night', [item], 'A no-fuss late-night option when you want something easy and reasonable.', dayPart, summary),
        );
      });
  }

  return candidates;
};

const isRepeatedFromToday = (candidate: Candidate, logNames: string[]) => {
  const joinedName = normalizeName(candidate.title);
  return logNames.some((name) => name && (joinedName.includes(name) || name.includes(joinedName)));
};

const getCoherenceBonus = (candidate: Candidate) => {
  const categories = candidate.ingredients.map((item) => inferredCategory(item));
  const roles = candidate.ingredients.map((item) => inferredMealRole(item));
  let bonus = candidate.coherenceScore;

  if (categories.includes('condiment') && candidate.ingredients.length === 1) {
    bonus -= 10;
  }

  if (roles.filter((role) => role === 'condiment').length > 1) {
    bonus -= 6;
  }

  if (categories.includes('dairy') && categories.includes('fruit')) {
    bonus += 4;
  }

  if (categories.includes('protein') && categories.includes('carb')) {
    bonus += 4;
  }

  if (categories.includes('snack') && categories.includes('protein')) {
    bonus += 3;
  }

  return bonus;
};

const filterCandidate = (
  candidate: Candidate,
  summary: TodaySummary,
  goal: SuggestionGoal,
  lowEffortAvailable: boolean,
) => {
  const proteinFloor = summary.remainingProtein >= 25 ? goalProteinFloor[goal] : 0;
  const condimentCount = candidate.ingredients.filter((item) => inferredCategory(item) === 'condiment').length;
  const fatCount = candidate.ingredients.filter((item) => inferredCategory(item) === 'fat').length;

  if (candidate.ingredients.length > 3) {
    return false;
  }

  if (condimentCount >= candidate.ingredients.length / 2) {
    return false;
  }

  if (fatCount === candidate.ingredients.length) {
    return false;
  }

  if (candidate.estimatedProtein < proteinFloor) {
    return false;
  }

  if (candidate.estimatedCalories > Math.max(summary.remainingCalories + 250, 700)) {
    return false;
  }

  if (lowEffortAvailable && effortRank[candidate.effortLevel] > effortRank.assemble && candidate.ingredients.length >= 2) {
    return false;
  }

  return true;
};

const scoreCandidate = (
  candidate: Candidate,
  summary: TodaySummary,
  dayPart: DayPart,
  logNames: string[],
  variationSeed: number,
) => {
  const calorieTarget = summary.remainingCalories || 300;
  const proteinTarget = summary.remainingProtein || 20;
  const calorieDistance = Math.abs(candidate.estimatedCalories - calorieTarget) / Math.max(calorieTarget, 250);
  const proteinDistance = Math.abs(candidate.estimatedProtein - proteinTarget) / Math.max(proteinTarget, 15);
  const repeatedPenalty = isRepeatedFromToday(candidate, logNames) ? 12 : 0;
  const lowEffortBonus = 10 - effortRank[candidate.effortLevel] * 3;
  const timeBonus =
    dayPart === 'late-night'
      ? candidate.effortLevel === 'no_prep' || candidate.effortLevel === 'assemble'
        ? 8
        : -4
      : dayPart === 'morning'
        ? candidate.estimatedPrepTimeMinutes <= 5
          ? 6
          : -2
        : 0;
  const varietyBonus = new Set(candidate.ingredients.map((item) => inferredCategory(item))).size * 2;
  const seedBonus = ((variationSeed + candidate.id.length) % 5) - 2;

  return (
    100
    - calorieDistance * 18
    - proteinDistance * 24
    + getCoherenceBonus(candidate)
    + lowEffortBonus
    + timeBonus
    + varietyBonus
    + seedBonus
    - repeatedPenalty
  );
};

export const getSuggestions = ({
  pantryItems,
  todayLogs,
  profile,
  todaySummary,
  now,
  goal = 'balanced',
  excludedSuggestionIds = [],
  variationSeed = 0,
}: SuggestionContext): SuggestionEngineResult => {
  if (!profile || profile.daily_calorie_target <= 0 || profile.daily_protein_target <= 0) {
    return {
      suggestions: [],
      caveats: [],
      emptyState: {
        title: 'Targets needed first',
        description: 'Set daily calories and protein so Graze can rank realistic next-meal suggestions.',
      },
    };
  }

  if (!pantryItems.length) {
    return {
      suggestions: [],
      caveats: [],
      emptyState: {
        title: 'Add a few pantry staples',
        description: 'Suggestions need at least a couple of active pantry items to build normal low-effort combinations.',
      },
    };
  }

  const stockedPantryItems = pantryItems.filter(hasAtLeastOneServingInStock);

  if (!stockedPantryItems.length) {
    return {
      suggestions: [],
      caveats: [],
      emptyState: {
        title: 'Not enough stocked ingredients',
        description: 'Suggestions only use pantry items with at least one full serving left in stock.',
      },
    };
  }

  const dayPart = getDayPart(now);
  const logNames = getLogNames(todayLogs);
  const candidates = generateCandidates(stockedPantryItems, dayPart, todaySummary);
  const lowEffortAvailable = candidates.some((candidate) => effortRank[candidate.effortLevel] <= effortRank.assemble);
  const metadataCaveats: string[] = [];

  if (stockedPantryItems.every((item) => item.category === 'other')) {
    metadataCaveats.push('Suggestion quality improves once pantry items are tagged with categories.');
  }

  if (stockedPantryItems.every((item) => item.meal_role === 'main')) {
    metadataCaveats.push('Meal roles help Graze tell real meal bases from toppings and condiments.');
  }

  const rankedSuggestions = candidates
    .filter((candidate) => !excludedSuggestionIds.includes(candidate.id))
    .filter((candidate) => filterCandidate(candidate, todaySummary, goal, lowEffortAvailable))
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(candidate, todaySummary, dayPart, logNames, variationSeed),
    }))
    .sort((left, right) => right.score - left.score)
    .filter(
      (entry, index, list) =>
        list.findIndex((candidate) => candidate.candidate.title === entry.candidate.title) === index,
    )
    .slice(0, 3)
    .map(({ candidate }): Suggestion => ({
      id: candidate.id,
      title: candidate.title,
      description: candidate.description,
      ingredients: candidate.ingredients.map((item) => item.name),
      ingredientDetails: candidate.ingredients.map((item) => ({
        pantryItemId: item.id,
        name: item.name,
        servingAmount: item.serving_amount,
        servingUnit: item.serving_unit,
        stockAmountRequired: item.serving_amount,
        displayServing: buildDefaultServingLabel(item.serving_amount, item.serving_unit),
      })),
      estimatedCalories: candidate.estimatedCalories,
      estimatedProtein: candidate.estimatedProtein,
      estimatedPrepTimeMinutes: candidate.estimatedPrepTimeMinutes,
      effortLevel: candidate.effortLevel,
      reason: candidate.reason,
      caveats: [...candidate.caveats, ...metadataCaveats],
    }));

  if (!rankedSuggestions.length) {
    return {
      suggestions: [],
      caveats: metadataCaveats,
      emptyState: {
        title: 'Not enough good combinations yet',
        description: 'Graze could not find a normal low-effort suggestion from the current pantry, so add a few more staples or adjust pantry metadata.',
      },
    };
  }

  return {
    suggestions: rankedSuggestions,
    caveats: metadataCaveats,
  };
};
