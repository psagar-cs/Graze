const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export const EXPIRY_SOON_DAYS = 3;

export type ExpiryStatus = {
  hasExpiry: boolean;
  expiresOn: string | null;
  isExpired: boolean;
  isToday: boolean;
  isSoon: boolean;
  daysUntil: number | null;
  label: string | null;
};

const shortDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

const startOfLocalDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate());

export const parseDateOnly = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const match = value.trim().match(DATE_ONLY_PATTERN);

  if (!match) {
    return null;
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(year, month - 1, day, 12, 0, 0, 0);

  if (
    parsed.getFullYear() !== year
    || parsed.getMonth() !== month - 1
    || parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
};

export const normalizeDateOnly = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? '';

  if (!trimmed) {
    return null;
  }

  return parseDateOnly(trimmed) ? trimmed : null;
};

export const getExpiryStatus = (
  expiresOn: string | null | undefined,
  now: Date = new Date(),
): ExpiryStatus => {
  const parsed = parseDateOnly(expiresOn ?? null);

  if (!parsed) {
    return {
      hasExpiry: false,
      expiresOn: null,
      isExpired: false,
      isToday: false,
      isSoon: false,
      daysUntil: null,
      label: null,
    };
  }

  const today = startOfLocalDay(now);
  const expiryDay = startOfLocalDay(parsed);
  const daysUntil = Math.round((expiryDay.getTime() - today.getTime()) / 86400000);
  const isExpired = daysUntil < 0;
  const isToday = daysUntil === 0;
  const isSoon = daysUntil > 0 && daysUntil <= EXPIRY_SOON_DAYS;

  let label: string;

  if (isExpired) {
    label = 'Expired';
  } else if (isToday) {
    label = 'Expires today';
  } else if (isSoon) {
    label = `Expires in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`;
  } else {
    label = `Expires ${shortDateFormatter.format(expiryDay)}`;
  }

  return {
    hasExpiry: true,
    expiresOn: expiresOn ?? null,
    isExpired,
    isToday,
    isSoon,
    daysUntil,
    label,
  };
};
