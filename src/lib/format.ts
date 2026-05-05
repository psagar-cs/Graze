const formatDecimal = (value: number) => {
  if (!Number.isFinite(value)) {
    return '0';
  }

  const rounded = Math.round(value * 100) / 100;

  if (Number.isInteger(rounded)) {
    return String(rounded);
  }

  return rounded.toFixed(2).replace(/\.?0+$/, '');
};

export const formatCalories = (value: number) => `${formatDecimal(value)} cal`;
export const formatProtein = (value: number) => `${formatDecimal(value)}g protein`;
