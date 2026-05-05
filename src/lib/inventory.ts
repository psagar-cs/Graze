import type { PantryItem, PantryUnit } from '../types';

const unitLabels: Record<PantryUnit, { singular: string; plural: string }> = {
  serving: { singular: 'serving', plural: 'servings' },
  cup: { singular: 'cup', plural: 'cups' },
  tbsp: { singular: 'tbsp', plural: 'tbsp' },
  tsp: { singular: 'tsp', plural: 'tsp' },
  piece: { singular: 'piece', plural: 'pieces' },
  can: { singular: 'can', plural: 'cans' },
  gram: { singular: 'gram', plural: 'grams' },
  ounce: { singular: 'ounce', plural: 'ounces' },
  pound: { singular: 'lb', plural: 'lbs' },
};

export const roundInventoryAmount = (value: number) => Math.round(value * 100) / 100;

export const formatInventoryNumber = (value: number) => {
  if (!Number.isFinite(value)) {
    return '0';
  }

  const rounded = roundInventoryAmount(value);

  if (Number.isInteger(rounded)) {
    return String(rounded);
  }

  return rounded.toFixed(2).replace(/\.?0+$/, '');
};

export const formatUnitLabel = (unit: PantryUnit, amount: number) =>
  Math.abs(amount) === 1 ? unitLabels[unit].singular : unitLabels[unit].plural;

export const formatAmountWithUnit = (amount: number, unit: PantryUnit) =>
  `${formatInventoryNumber(amount)} ${formatUnitLabel(unit, amount)}`;

export const buildDefaultServingLabel = (servingAmount: number, servingUnit: PantryUnit) =>
  formatAmountWithUnit(servingAmount, servingUnit);

export const getServingsInStock = (item: Pick<PantryItem, 'stock_amount' | 'serving_amount'>) => {
  if (!Number.isFinite(item.stock_amount) || !Number.isFinite(item.serving_amount) || item.serving_amount <= 0) {
    return 0;
  }

  return roundInventoryAmount(item.stock_amount / item.serving_amount);
};

export const hasAnyStock = (item: Pick<PantryItem, 'stock_amount'>) => item.stock_amount > 0;

export const hasAtLeastOneServingInStock = (
  item: Pick<PantryItem, 'stock_amount' | 'serving_amount'>,
) => item.stock_amount >= item.serving_amount && item.serving_amount > 0;
