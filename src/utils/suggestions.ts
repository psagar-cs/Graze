import type { PantryItem, SuggestionPreview, TodaySummary } from '../types';

const buildPreview = (
  id: string,
  title: string,
  reason: string,
  effortLabel: string,
  estimatedCalories: number,
  estimatedProtein: number,
): SuggestionPreview => ({
  id,
  title,
  reason,
  effortLabel,
  estimatedCalories,
  estimatedProtein,
  isPreview: true,
});

export const getSuggestionPreviews = (
  pantryItems: PantryItem[],
  summary: TodaySummary,
): SuggestionPreview[] => {
  const pantryNames = pantryItems.map((item) => item.name.toLowerCase());
  const hasToast = pantryNames.some((name) => name.includes('bread') || name.includes('toast'));
  const hasFish = pantryNames.some((name) => name.includes('sardine') || name.includes('tuna'));
  const hasYogurt = pantryNames.some((name) => name.includes('yogurt'));
  const hasBanana = pantryNames.some((name) => name.includes('banana'));
  const hasPeanutButter = pantryNames.some((name) => name.includes('peanut butter'));

  const cards: SuggestionPreview[] = [];

  if (hasFish && hasToast) {
    cards.push(
      buildPreview(
        'fish-toast',
        'Tinned fish on toast',
        'High-protein, salty, and almost no friction if you need a real meal fast.',
        '2 min',
        420,
        28,
      ),
    );
  }

  if (hasYogurt && hasBanana) {
    cards.push(
      buildPreview(
        'yogurt-banana',
        'Greek yogurt + banana bowl',
        'A cold, easy option that closes a protein gap without feeling like cooking.',
        '1 min',
        330,
        23,
      ),
    );
  }

  if (hasPeanutButter && hasBanana) {
    cards.push(
      buildPreview(
        'pb-banana',
        'Peanut butter banana snack',
        'Good when calories are lagging and you want something quick and sweet.',
        '1 min',
        360,
        12,
      ),
    );
  }

  if (cards.length < 3 && summary.remainingProtein > summary.remainingCalories / 20) {
    cards.push(
      buildPreview(
        'protein-gap',
        'Lean protein add-on',
        'Protein is the main thing left today, so this preview leans savory and simple.',
        '5 min',
        280,
        30,
      ),
    );
  }

  if (cards.length < 3) {
    cards.push(
      buildPreview(
        'easy-calories',
        'Easy calorie top-up',
        'A placeholder preview for the future smart suggestion engine. Good for late-day catch-up.',
        '3 min',
        Math.max(250, Math.min(summary.remainingCalories, 550)),
        Math.max(12, Math.min(summary.remainingProtein, 28)),
      ),
    );
  }

  return cards.slice(0, 3);
};
