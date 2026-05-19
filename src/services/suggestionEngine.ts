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
  SuggestionPriority,
  TodaySummary,
} from '../types';
import { getExpiryStatus } from '../lib/expiry';
import { buildDefaultServingLabel } from '../lib/inventory';
import { hasAtLeastOneServingInStock } from '../lib/inventory';

type SuggestionContext = {
  pantryItems: PantryItem[];
  todayLogs: FoodLogEntry[];
  profile: Profile | null;
  todaySummary: TodaySummary;
  now: Date;
  goal?: SuggestionGoal;
  priority?: SuggestionPriority;
  excludedSuggestionIds?: string[];
  variationSeed?: number;
};

type CandidatePattern =
  | 'base-protein'
  | 'protein-fruit'
  | 'protein-vegetable'
  | 'dairy-fruit'
  | 'dairy-fruit-fat'
  | 'dairy-fruit-carb'
  | 'dairy-snack'
  | 'dairy-snack-sweet-condiment'
  | 'dairy-fat'
  | 'dairy-fat-sweet-condiment'
  | 'base-protein-condiment'
  | 'single-snack'
  | 'single-complete'
  | 'late-night';

type Candidate = {
  id: string;
  canonicalKey: string;
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

const snackPatterns: CandidatePattern[] = [
  'dairy-fruit',
  'dairy-fruit-fat',
  'dairy-fruit-carb',
  'dairy-snack',
  'dairy-snack-sweet-condiment',
  'dairy-fat',
  'dairy-fat-sweet-condiment',
  'single-snack',
  'single-complete',
];

const addUniqueCandidate = (candidates: Candidate[], candidate: Candidate) => {
  if (candidates.some((entry) => entry.id === candidate.id)) {
    return;
  }

  candidates.push(candidate);
};

const normalizeName = (value: string) => value.trim().toLowerCase();

const buildCanonicalIngredientKey = (items: PantryItem[]) =>
  items
    .map((item) => item.id)
    .sort()
    .join('|');

const inferredCategory = (item: PantryItem) => {
  if (item.category !== 'other') {
    return item.category;
  }

  const role = inferredMealRole(item);

  if (role === 'base') {
    return 'carb';
  }

  if (role === 'condiment') {
    return 'condiment';
  }

  if (role === 'snack') {
    return 'snack';
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
  const canonicalKey = buildCanonicalIngredientKey(items);
  const title = ingredientNames.join(' + ');

  return {
    id: `${pattern}:${canonicalKey}`,
    canonicalKey,
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

const sweetCondimentKeywords = ['honey', 'jam', 'jelly', 'maple', 'cinnamon', 'sweetener', 'agave', 'syrup'];

const isSweetCondimentItem = (item: PantryItem) =>
  inferredCategory(item) === 'condiment' && hasAnyKeyword(normalizeName(item.name), sweetCondimentKeywords);

const classifyItems = (items: PantryItem[]) => {
  const groups = {
    proteins: [] as PantryItem[],
    carbs: [] as PantryItem[],
    fruits: [] as PantryItem[],
    dairy: [] as PantryItem[],
    snacks: [] as PantryItem[],
    condiments: [] as PantryItem[],
    fats: [] as PantryItem[],
    vegetables: [] as PantryItem[],
    bases: [] as PantryItem[],
    toppings: [] as PantryItem[],
    other: [] as PantryItem[],
  };

  items.forEach((item) => {
    const category = inferredCategory(item);
    const role = inferredMealRole(item);

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
      case 'vegetable':
        groups.vegetables.push(item);
        break;
      default:
        groups.other.push(item);
    }

    if (role === 'base') {
      groups.bases.push(item);
    }

    if (role === 'topping') {
      groups.toppings.push(item);
    }
  });

  return groups;
};

const isCompleteStandaloneItem = (item: PantryItem) => {
  const category = inferredCategory(item);
  const role = inferredMealRole(item);
  const effort = inferredEffort(item);

  if (role === 'condiment') {
    return false;
  }

  if (category === 'condiment' || category === 'fat') {
    return false;
  }

  if (effortRank[effort] > effortRank.microwave) {
    return false;
  }

  return (
    item.protein_per_serving >= 15
    || (item.calories_per_serving >= 180 && category !== 'fruit')
    || category === 'dairy'
    || category === 'snack'
  );
};

const isSingleSnackItem = (item: PantryItem) => {
  const category = inferredCategory(item);
  const role = inferredMealRole(item);

  return category === 'snack'
    || category === 'fruit'
    || role === 'snack'
    || (category === 'dairy' && item.calories_per_serving < 220 && item.protein_per_serving < 20);
};

const hasCategory = (candidate: Candidate, category: PantryCategory) =>
  candidate.ingredients.some((item) => inferredCategory(item) === category);

const hasRole = (candidate: Candidate, role: PantryMealRole) =>
  candidate.ingredients.some((item) => inferredMealRole(item) === role);

const countCategory = (candidate: Candidate, category: PantryCategory) =>
  candidate.ingredients.filter((item) => inferredCategory(item) === category).length;

const hasDryBaseProteinShape = (candidate: Candidate) => {
  if (candidate.ingredients.length !== 2) {
    return false;
  }

  if (!hasRole(candidate, 'base')) {
    return false;
  }

  if (!hasCategory(candidate, 'protein')) {
    return false;
  }

  return !hasCategory(candidate, 'condiment')
    && !hasCategory(candidate, 'fat')
    && !hasCategory(candidate, 'fruit')
    && !hasCategory(candidate, 'vegetable')
    && !hasRole(candidate, 'topping');
};

const hasCondimentSupport = (candidate: Candidate, pantryItems: PantryItem[]) =>
  hasDryBaseProteinShape(candidate)
  && pantryItems.some((item) =>
    !candidate.ingredients.some((candidateItem) => candidateItem.id === item.id)
    && inferredCategory(item) === 'condiment');

const generateCandidates = (
  items: PantryItem[],
  dayPart: DayPart,
  summary: TodaySummary,
) => {
  const candidates: Candidate[] = [];
  const groups = classifyItems(items);

  groups.proteins.forEach((protein) => {
    groups.bases.forEach((base) => {
      addUniqueCandidate(
        candidates,
        buildCandidate('base-protein', [base, protein], 'A base-and-protein pairing that can work as a simple meal when the pantry is sparse.', dayPart, summary),
      );
    });

    groups.fruits.forEach((fruit) => {
      addUniqueCandidate(
        candidates,
        buildCandidate('protein-fruit', [protein, fruit], 'A lighter combo when you want protein without a full meal.', dayPart, summary),
      );
    });

    groups.vegetables.forEach((vegetable) => {
      addUniqueCandidate(
        candidates,
        buildCandidate('protein-vegetable', [protein, vegetable], 'A lean protein-forward option when you want something lighter but still meal-like.', dayPart, summary),
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

      groups.carbs.forEach((carb) => {
        addUniqueCandidate(
          candidates,
          buildCandidate('dairy-fruit-carb', [dairy, fruit, carb], 'A fuller bowl-style option when dairy and fruit need a more substantial base.', dayPart, summary),
        );
      });
    });

    groups.snacks.forEach((snack) => {
      addUniqueCandidate(
        candidates,
        buildCandidate('dairy-snack', [dairy, snack], 'A simple yogurt-or-milk based snack combo that still feels cohesive.', dayPart, summary),
      );
    });

    groups.fats.forEach((fat) => {
      addUniqueCandidate(
        candidates,
        buildCandidate('dairy-fat', [dairy, fat], 'A simple bowl-style snack when dairy and a topping carry most of the bite.', dayPart, summary),
      );
    });

    groups.condiments
      .filter(isSweetCondimentItem)
      .forEach((condiment) => {
        groups.snacks.forEach((snack) => {
          addUniqueCandidate(
            candidates,
            buildCandidate(
              'dairy-snack-sweet-condiment',
              [dairy, snack, condiment],
              'A sweet dairy-based snack bowl with a pantry topping and a clearly snack-friendly sweet add-on.',
              dayPart,
              summary,
            ),
          );
        });

        groups.fats.forEach((fat) => {
          addUniqueCandidate(
            candidates,
            buildCandidate(
              'dairy-fat-sweet-condiment',
              [dairy, fat, condiment],
              'A sweet dairy-based snack bowl with a richer topping and a clearly snack-friendly sweet add-on.',
              dayPart,
              summary,
            ),
          );
        });
      });
  });

  groups.bases.forEach((base) => {
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

  items
    .filter(isCompleteStandaloneItem)
    .forEach((item) => {
      addUniqueCandidate(
        candidates,
        buildCandidate(
          isSingleSnackItem(item) ? 'single-snack' : 'single-complete',
          [item],
          isSingleSnackItem(item)
            ? 'A single-item snack fallback when you want something quick and the pantry is light.'
            : 'A complete-enough single-item fallback when one pantry staple can stand on its own.',
          dayPart,
          summary,
        ),
      );
    });

  return candidates;
};

const isRepeatedFromToday = (candidate: Candidate, logNames: string[]) => {
  const joinedName = normalizeName(candidate.title);
  return logNames.some((name) => name && (joinedName.includes(name) || name.includes(joinedName)));
};

const getCoherenceBonus = (candidate: Candidate, pantryItems: PantryItem[]) => {
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

  if (categories.includes('protein') && categories.includes('vegetable')) {
    bonus += 2;
  }

  if (categories.includes('dairy') && categories.includes('fruit') && categories.includes('carb')) {
    bonus += 5;
  }

  if (candidate.pattern === 'dairy-snack' || candidate.pattern === 'dairy-fat') {
    bonus += 4;
  }

  if (candidate.pattern === 'dairy-snack-sweet-condiment' || candidate.pattern === 'dairy-fat-sweet-condiment') {
    bonus += 6;
  }

  if (hasDryBaseProteinShape(candidate)) {
    bonus -= hasCondimentSupport(candidate, pantryItems) ? 7 : 2;
  }

  if (candidate.pattern === 'base-protein-condiment') {
    bonus += 5;
  }

  if (candidate.pattern === 'single-complete') {
    bonus += candidate.estimatedProtein >= 18 || candidate.estimatedCalories >= 220 ? 3 : -3;
  }

  if (candidate.ingredients.length === 3 && countCategory(candidate, 'condiment') >= 1 && categories.includes('protein') && hasRole(candidate, 'base')) {
    bonus += 2;
  }

  if (candidate.ingredients.length >= 3 && countCategory(candidate, 'condiment') >= 2) {
    bonus -= 6;
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

  if (candidate.pattern === 'single-complete' && candidate.estimatedCalories < 120 && candidate.estimatedProtein < 12) {
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

const getExpiryBonus = (candidate: Candidate, now: Date) =>
  candidate.ingredients.reduce((sum, item) => {
    const expiryStatus = getExpiryStatus(item.expires_on, now);

    if (expiryStatus.isToday) {
      return sum + 12;
    }

    if (expiryStatus.isSoon && expiryStatus.daysUntil !== null) {
      return sum + Math.max(4, 10 - expiryStatus.daysUntil * 2);
    }

    return sum;
  }, 0);

const getProteinDensity = (candidate: Candidate) =>
  candidate.estimatedProtein / Math.max(candidate.estimatedCalories, 120);

const countSoonIngredients = (candidate: Candidate, now: Date) =>
  candidate.ingredients.filter((item) => {
    const expiryStatus = getExpiryStatus(item.expires_on, now);
    return expiryStatus.isToday || expiryStatus.isSoon;
  }).length;

const isSnackLikeCandidate = (candidate: Candidate) => {
  if (snackPatterns.includes(candidate.pattern)) {
    return true;
  }

  const categories = new Set(candidate.ingredients.map((item) => inferredCategory(item)));
  const roles = new Set(candidate.ingredients.map((item) => inferredMealRole(item)));

  if (candidate.ingredients.length === 1) {
    return categories.has('snack') || categories.has('fruit') || categories.has('dairy') || roles.has('snack');
  }

  if (categories.has('dairy') && (categories.has('fruit') || categories.has('fat') || categories.has('snack'))) {
    return true;
  }

  return categories.has('snack') && candidate.ingredients.length <= 3;
};

const isSingleSnackFallback = (candidate: Candidate) =>
  candidate.ingredients.length === 1 && (candidate.pattern === 'single-snack' || isSnackLikeCandidate(candidate));

const isMealLikeCandidate = (candidate: Candidate) => {
  if (candidate.ingredients.length >= 2 && !isSnackLikeCandidate(candidate)) {
    return true;
  }

  return candidate.pattern === 'base-protein'
    || candidate.pattern === 'base-protein-condiment'
    || candidate.pattern === 'protein-vegetable';
};

const getPriorityAdjustment = (
  candidate: Candidate,
  priority: SuggestionPriority,
  dayPart: DayPart,
  now: Date,
  mealLikeCandidateCount: number,
) => {
  const ingredientCountPenalty = Math.max(0, candidate.ingredients.length - 1);
  const proteinDensity = getProteinDensity(candidate);
  const soonIngredientCount = countSoonIngredients(candidate, now);
  const snackLike = isSnackLikeCandidate(candidate);
  const singleSnackFallback = isSingleSnackFallback(candidate);
  const mealLikePenalty = mealLikeCandidateCount > 0 && singleSnackFallback
    ? candidate.estimatedCalories < 220
      ? 18
      : 10
    : 0;

  switch (priority) {
    case 'easy':
      return (
        (candidate.effortLevel === 'no_prep' ? 12 : candidate.effortLevel === 'assemble' ? 7 : candidate.effortLevel === 'microwave' ? 1 : -10)
        - ingredientCountPenalty * 2
        + (dayPart === 'morning' || dayPart === 'late-night' ? 3 : 0)
        - mealLikePenalty * 0.6
      );
    case 'high_protein':
      return (
        candidate.estimatedProtein * 0.85
        + proteinDensity * 90
        - (candidate.estimatedProtein < 16 ? 12 : 0)
        - (candidate.estimatedProtein < 22 && candidate.estimatedCalories > 350 ? 5 : 0)
        - mealLikePenalty * 0.45
      );
    case 'use_soon':
      return (soonIngredientCount > 0 ? soonIngredientCount * 12 + getExpiryBonus(candidate, now) * 1.35 : 0) - mealLikePenalty * 0.5;
    case 'snack':
      return (
        (snackLike ? 18 : -6)
        + (candidate.ingredients.length === 1 ? 7 : 0)
        + (candidate.estimatedPrepTimeMinutes <= 3 ? 4 : 0)
        - (hasRole(candidate, 'base') && hasCategory(candidate, 'protein') && candidate.ingredients.length >= 2 ? 6 : 0)
        - (candidate.effortLevel === 'cook' ? 8 : 0)
      );
    case 'balanced':
    default:
      return -mealLikePenalty;
  }
};

const scoreCandidate = (
  candidate: Candidate,
  pantryItems: PantryItem[],
  summary: TodaySummary,
  dayPart: DayPart,
  now: Date,
  logNames: string[],
  variationSeed: number,
  priority: SuggestionPriority,
  mealLikeCandidateCount: number,
) => {
  const calorieTarget = summary.remainingCalories || 300;
  const proteinTarget = summary.remainingProtein || 20;
  const calorieDistance = Math.abs(candidate.estimatedCalories - calorieTarget) / Math.max(calorieTarget, 250);
  const proteinDistance = Math.abs(candidate.estimatedProtein - proteinTarget) / Math.max(proteinTarget, 15);
  const repeatedPenalty = isRepeatedFromToday(candidate, logNames) ? 18 : 0;
  const lowEffortBonus = 12 - effortRank[candidate.effortLevel] * 4;
  const timeBonus =
    dayPart === 'late-night'
      ? candidate.effortLevel === 'no_prep'
        ? 10
        : candidate.effortLevel === 'assemble'
          ? 5
          : -7
      : dayPart === 'morning'
        ? candidate.effortLevel === 'no_prep' || candidate.effortLevel === 'assemble'
          ? 7
          : -4
        : dayPart === 'midday'
          ? candidate.effortLevel === 'cook'
            ? -3
            : 2
          : candidate.effortLevel === 'cook'
            ? -1
            : 1;
  const varietyBonus = new Set(candidate.ingredients.map((item) => inferredCategory(item))).size * 3;
  const expiryBonus = getExpiryBonus(candidate, now);
  const seedBonus = ((variationSeed + candidate.id.length) % 5) - 2;
  const efficiencyPenalty =
    candidate.ingredients.length >= 3 && candidate.estimatedProtein < 16 && candidate.estimatedCalories < 260
      ? 5
      : 0;
  const priorityAdjustment = getPriorityAdjustment(candidate, priority, dayPart, now, mealLikeCandidateCount);

  return (
    100
    - calorieDistance * 18
    - proteinDistance * 24
    + getCoherenceBonus(candidate, pantryItems)
    + lowEffortBonus
    + timeBonus
    + varietyBonus
    + expiryBonus
    + priorityAdjustment
    + seedBonus
    - efficiencyPenalty
    - repeatedPenalty
  );
};

const countSharedIngredients = (left: Candidate, right: Candidate) =>
  left.ingredients.filter((item) => right.ingredients.some((other) => other.id === item.id)).length;

const isNearDuplicateCandidate = (left: Candidate, right: Candidate) => {
  if (left.canonicalKey === right.canonicalKey) {
    return true;
  }

  const sharedIngredients = countSharedIngredients(left, right);

  if (sharedIngredients >= 2) {
    return true;
  }

  const leftHasBase = hasRole(left, 'base');
  const rightHasBase = hasRole(right, 'base');
  const leftHasProtein = hasCategory(left, 'protein');
  const rightHasProtein = hasCategory(right, 'protein');

  return leftHasBase && rightHasBase && leftHasProtein && rightHasProtein && sharedIngredients >= 1;
};

const pickTopDistinctCandidates = (
  ranked: { candidate: Candidate; score: number }[],
  limit: number,
  priority: SuggestionPriority,
) => {
  const chosen: { candidate: Candidate; score: number }[] = [];
  const leftovers: { candidate: Candidate; score: number }[] = [];
  const mealLikeRanked = ranked.filter((entry) => isMealLikeCandidate(entry.candidate));
  const shouldProtectMealLikeDiversity = priority !== 'snack' && priority !== 'easy' && mealLikeRanked.length > 0;

  ranked.forEach((entry) => {
    if (
      shouldProtectMealLikeDiversity
      && isSingleSnackFallback(entry.candidate)
      && chosen.length === 0
      && mealLikeRanked.some((mealLike) => mealLike.candidate.id !== entry.candidate.id)
    ) {
      leftovers.push(entry);
      return;
    }

    if (chosen.length < limit && !chosen.some((picked) => isNearDuplicateCandidate(picked.candidate, entry.candidate))) {
      chosen.push(entry);
      return;
    }

    leftovers.push(entry);
  });

  for (const entry of leftovers) {
    if (chosen.length >= limit) {
      break;
    }

    chosen.push(entry);
  }

  return chosen;
};

const pickUseSoonCandidates = (
  ranked: { candidate: Candidate; score: number }[],
  limit: number,
  now: Date,
) => {
  const urgencyOrder: ExpiryUrgencyBucket[] = ['expires_today', 'expires_soon', 'not_urgent'];
  const chosen: { candidate: Candidate; score: number }[] = [];

  urgencyOrder.forEach((bucket) => {
    if (chosen.length >= limit) {
      return;
    }

    const bucketEntries = ranked.filter((entry) => getExpiryUrgencyBucket(entry.candidate, now) === bucket);
    const bucketChosen: { candidate: Candidate; score: number }[] = [];
    const bucketLeftovers: { candidate: Candidate; score: number }[] = [];

    bucketEntries.forEach((entry) => {
      if (
        bucketChosen.length < limit
        && !bucketChosen.some((picked) => isNearDuplicateCandidate(picked.candidate, entry.candidate))
      ) {
        bucketChosen.push(entry);
        return;
      }

      bucketLeftovers.push(entry);
    });

    const combinedBucket = [...bucketChosen, ...bucketLeftovers];

    for (const entry of combinedBucket) {
      if (chosen.length >= limit) {
        break;
      }

      chosen.push(entry);
    }
  });

  return chosen;
};

const pickHighProteinCandidates = (
  ranked: { candidate: Candidate; score: number }[],
  limit: number,
) => {
  const chosen: { candidate: Candidate; score: number }[] = [];
  const proteinLevels = Array.from(new Set(ranked.map((entry) => entry.candidate.estimatedProtein))).sort((left, right) => right - left);

  proteinLevels.forEach((proteinLevel) => {
    if (chosen.length >= limit) {
      return;
    }

    const levelEntries = ranked.filter((entry) => entry.candidate.estimatedProtein === proteinLevel);
    const levelChosen: { candidate: Candidate; score: number }[] = [];
    const levelLeftovers: { candidate: Candidate; score: number }[] = [];

    levelEntries.forEach((entry) => {
      if (
        levelChosen.length < limit
        && !levelChosen.some((picked) => isNearDuplicateCandidate(picked.candidate, entry.candidate))
      ) {
        levelChosen.push(entry);
        return;
      }

      levelLeftovers.push(entry);
    });

    const combinedLevel = [...levelChosen, ...levelLeftovers];

    for (const entry of combinedLevel) {
      if (chosen.length >= limit) {
        break;
      }

      chosen.push(entry);
    }
  });

  return chosen;
};

type ExpiryUrgencyBucket = 'expires_today' | 'expires_soon' | 'not_urgent';

const getExpiryUrgencyBucket = (candidate: Candidate, now: Date): ExpiryUrgencyBucket => {
  const statuses = candidate.ingredients.map((item) => getExpiryStatus(item.expires_on, now));

  if (statuses.some((status) => status.isToday)) {
    return 'expires_today';
  }

  if (statuses.some((status) => status.isSoon)) {
    return 'expires_soon';
  }

  return 'not_urgent';
};

const orderRankedCandidatesForPriority = (
  ranked: { candidate: Candidate; score: number }[],
  priority: SuggestionPriority,
  now: Date,
) => {
  if (priority === 'easy') {
    const effortBucketOrder: PantryEffortLevel[] = ['no_prep', 'assemble', 'microwave', 'cook'];

    return effortBucketOrder.flatMap((effortLevel) =>
      ranked.filter((entry) => entry.candidate.effortLevel === effortLevel),
    );
  }

  if (priority === 'use_soon') {
    const urgencyOrder: ExpiryUrgencyBucket[] = ['expires_today', 'expires_soon', 'not_urgent'];

    return urgencyOrder.flatMap((bucket) =>
      ranked.filter((entry) => getExpiryUrgencyBucket(entry.candidate, now) === bucket),
    );
  }

  if (priority === 'high_protein') {
    return [...ranked].sort((left, right) => {
      if (right.candidate.estimatedProtein !== left.candidate.estimatedProtein) {
        return right.candidate.estimatedProtein - left.candidate.estimatedProtein;
      }

      return right.score - left.score;
    });
  }

  return ranked;
};

const buildExpiryWarning = (items: PantryItem[], now: Date) => {
  const soonItems = items
    .map((item) => ({
      item,
      expiryStatus: getExpiryStatus(item.expires_on, now),
    }))
    .filter(({ expiryStatus }) => expiryStatus.isToday || expiryStatus.isSoon);

  if (!soonItems.length) {
    return null;
  }

  if (soonItems.length === 1) {
    const [{ item, expiryStatus }] = soonItems;
    const detail = expiryStatus.isToday
      ? 'expires today'
      : expiryStatus.daysUntil === 1
        ? 'expires in 1 day'
        : `expires in ${expiryStatus.daysUntil} days`;

    return `Use soon: ${item.name} ${detail}.`;
  }

  if (soonItems.length === 2) {
    return `Use soon: ${soonItems[0].item.name} and ${soonItems[1].item.name} expire soon.`;
  }

  return `Use soon: ${soonItems.length} ingredients expire soon.`;
};

export const getSuggestions = ({
  pantryItems,
  todayLogs,
  profile,
  todaySummary,
  now,
  goal = 'balanced',
  priority = 'balanced',
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
  const suggestionEligibleItems = stockedPantryItems.filter((item) => !getExpiryStatus(item.expires_on, now).isExpired);

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

  if (!suggestionEligibleItems.length) {
    return {
      suggestions: [],
      caveats: ['Expired pantry items stay visible in Pantry, but suggestions skip them until you update or clear the date.'],
      emptyState: {
        title: 'Only expired stocked items left',
        description: 'Your stocked pantry items all have expiry dates in the past, so Graze is holding them out of suggestions for now.',
      },
    };
  }

  const dayPart = getDayPart(now);
  const logNames = getLogNames(todayLogs);
  const candidates = generateCandidates(suggestionEligibleItems, dayPart, todaySummary);
  const lowEffortAvailable = candidates.some(
    (candidate) => effortRank[candidate.effortLevel] <= effortRank.assemble && !isSingleSnackFallback(candidate),
  );
  const mealLikeCandidateCount = candidates.filter(isMealLikeCandidate).length;
  const metadataCaveats: string[] = [];

  if (suggestionEligibleItems.every((item) => item.category === 'other')) {
    metadataCaveats.push('Suggestion quality improves once pantry items are tagged with categories.');
  }

  if (suggestionEligibleItems.every((item) => item.meal_role === 'main')) {
    metadataCaveats.push('Meal roles help Graze tell real meal bases from toppings and condiments.');
  }

  if (stockedPantryItems.length !== suggestionEligibleItems.length) {
    metadataCaveats.push('Expired pantry items are skipped when Graze builds suggestions.');
  }

  const rankedSuggestions = candidates
    .filter((candidate) => !excludedSuggestionIds.includes(candidate.id) && !excludedSuggestionIds.includes(candidate.canonicalKey))
    .filter((candidate) => filterCandidate(candidate, todaySummary, goal, lowEffortAvailable))
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(
        candidate,
        suggestionEligibleItems,
        todaySummary,
        dayPart,
        now,
        logNames,
        variationSeed,
        priority,
        mealLikeCandidateCount,
      ),
    }))
    .sort((left, right) => right.score - left.score)
    .filter(
      (entry, index, list) =>
        list.findIndex((candidate) => candidate.candidate.canonicalKey === entry.candidate.canonicalKey) === index,
    );
  const orderedSuggestions = orderRankedCandidatesForPriority(rankedSuggestions, priority, now);
  const shortlistedCandidates = priority === 'use_soon'
    ? pickUseSoonCandidates(orderedSuggestions, 3, now)
    : priority === 'high_protein'
      ? pickHighProteinCandidates(orderedSuggestions, 3)
      : pickTopDistinctCandidates(orderedSuggestions, 3, priority);

  const finalSuggestions = shortlistedCandidates
    .map(({ candidate }): Suggestion => {
      return {
        id: candidate.id,
        canonicalKey: candidate.canonicalKey,
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
        expiryWarning: buildExpiryWarning(candidate.ingredients, now),
      };
    });

  if (!finalSuggestions.length) {
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
    suggestions: finalSuggestions,
    caveats: metadataCaveats,
  };
};
