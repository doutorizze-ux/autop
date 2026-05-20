export type ThemeAppearance = {
  themeColor?: string | null;
  themeAccentColor?: string | null;
  themeSidebarStart?: string | null;
  themeSidebarEnd?: string | null;
  themeBackground?: string | null;
  themeLogo?: string | null;
};

export type AppliedThemeAppearance = {
  themeColor: string;
  themeAccentColor: string;
  themeSidebarStart: string;
  themeSidebarEnd: string;
  themeBackground: string;
  themeLogo: string;
};

export const defaultThemeAppearance: AppliedThemeAppearance = {
  themeColor: '#0056b3',
  themeAccentColor: '#0c7ff2',
  themeSidebarStart: '#0f172a',
  themeSidebarEnd: '#172f4c',
  themeBackground: '#eef2f6',
  themeLogo: '',
};

const storageKeys = {
  themeColor: 'theme_color',
  themeAccentColor: 'theme_accent_color',
  themeSidebarStart: 'theme_sidebar_start',
  themeSidebarEnd: 'theme_sidebar_end',
  themeBackground: 'theme_background',
  themeLogo: 'theme_logo',
} as const;

const colorFrom = (value: string | null | undefined, storageKey: string, fallback: string) =>
  value || localStorage.getItem(storageKey) || fallback;

const hexToRgba = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '').trim();
  const fullHex =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(fullHex)) {
    return `rgba(0, 86, 179, ${alpha})`;
  }

  const value = Number.parseInt(fullHex, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

export const applyAppearanceTheme = (
  appearance: ThemeAppearance = {},
  options: { persist?: boolean } = {}
): AppliedThemeAppearance => {
  const shouldPersist = options.persist !== false;
  const themeColor = colorFrom(appearance.themeColor, storageKeys.themeColor, defaultThemeAppearance.themeColor);
  const themeAccentColor = colorFrom(
    appearance.themeAccentColor,
    storageKeys.themeAccentColor,
    defaultThemeAppearance.themeAccentColor
  );
  const themeSidebarStart = colorFrom(
    appearance.themeSidebarStart,
    storageKeys.themeSidebarStart,
    defaultThemeAppearance.themeSidebarStart
  );
  const themeSidebarEnd = colorFrom(
    appearance.themeSidebarEnd,
    storageKeys.themeSidebarEnd,
    defaultThemeAppearance.themeSidebarEnd
  );
  const themeBackground = colorFrom(
    appearance.themeBackground,
    storageKeys.themeBackground,
    defaultThemeAppearance.themeBackground
  );
  const themeLogo = Object.prototype.hasOwnProperty.call(appearance, 'themeLogo')
    ? appearance.themeLogo || ''
    : localStorage.getItem(storageKeys.themeLogo) || '';

  const root = document.documentElement;
  root.style.setProperty('--primary-color', themeColor);
  root.style.setProperty('--primary-hover', themeAccentColor);
  root.style.setProperty('--primary-gradient-end', themeAccentColor);
  root.style.setProperty('--primary-ring', hexToRgba(themeColor, 0.12));
  root.style.setProperty('--primary-shadow', hexToRgba(themeColor, 0.22));
  root.style.setProperty('--primary-soft-bg', hexToRgba(themeColor, 0.1));
  root.style.setProperty('--primary-subtle-bg', hexToRgba(themeColor, 0.05));
  root.style.setProperty('--primary-muted-bg', hexToRgba(themeColor, 0.08));
  root.style.setProperty('--primary-strong-bg', hexToRgba(themeColor, 0.14));
  root.style.setProperty('--primary-soft-border', hexToRgba(themeColor, 0.15));
  root.style.setProperty('--sidebar-start', themeSidebarStart);
  root.style.setProperty('--sidebar-end', themeSidebarEnd);
  root.style.setProperty('--sidebar-glow', hexToRgba(themeAccentColor, 0.24));
  root.style.setProperty('--sidebar-active-glow', hexToRgba(themeAccentColor, 0.18));
  root.style.setProperty('--bg-color', themeBackground);

  if (shouldPersist) {
    localStorage.setItem(storageKeys.themeColor, themeColor);
    localStorage.setItem(storageKeys.themeAccentColor, themeAccentColor);
    localStorage.setItem(storageKeys.themeSidebarStart, themeSidebarStart);
    localStorage.setItem(storageKeys.themeSidebarEnd, themeSidebarEnd);
    localStorage.setItem(storageKeys.themeBackground, themeBackground);

    if (themeLogo) {
      localStorage.setItem(storageKeys.themeLogo, themeLogo);
    } else {
      localStorage.removeItem(storageKeys.themeLogo);
    }
  }

  return {
    themeColor,
    themeAccentColor,
    themeSidebarStart,
    themeSidebarEnd,
    themeBackground,
    themeLogo,
  };
};
