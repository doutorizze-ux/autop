const APP_TIME_ZONE = 'America/Sao_Paulo';

const isoWithoutTimezonePattern = /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}/;
const timezoneSuffixPattern = /(Z|[+-]\d{2}:?\d{2})$/i;

const parseDateValue = (value?: string | Date | null) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const rawValue = String(value).trim();
  if (!rawValue) return null;

  const normalizedValue =
    isoWithoutTimezonePattern.test(rawValue) && !timezoneSuffixPattern.test(rawValue)
      ? `${rawValue.replace(' ', 'T')}Z`
      : rawValue;
  const parsedDate = new Date(normalizedValue);

  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

export const formatDateTime = (value?: string | Date | null) => {
  const parsedDate = parseDateValue(value);
  if (!parsedDate) return '---';

  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: APP_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(parsedDate);
};
