const pad = (value: number) => value.toString().padStart(2, '0');

export const getTodayRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    label: `${pad(now.getMonth() + 1)}/${pad(now.getDate())}/${now.getFullYear()}`,
  };
};

export const formatTime = (isoString: string) => {
  const date = new Date(isoString);

  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
};
