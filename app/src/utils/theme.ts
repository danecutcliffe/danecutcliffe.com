export type ThemePreference = 'auto' | 'light' | 'dark';

const themeStorageKey = 'time-clock-theme-preference';

export function getStoredThemePreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(themeStorageKey);
    return stored === 'light' || stored === 'dark' || stored === 'auto' ? stored : 'auto';
  } catch {
    return 'auto';
  }
}

export function storeThemePreference(preference: ThemePreference) {
  try {
    window.localStorage.setItem(themeStorageKey, preference);
  } catch {
    // Local storage can be unavailable in private or locked-down browser contexts.
  }
}

export function applyThemePreference(preference: ThemePreference) {
  const root = document.documentElement;
  if (preference === 'auto') {
    root.removeAttribute('data-theme');
    root.style.colorScheme = 'light dark';
    return;
  }

  root.dataset.theme = preference;
  root.style.colorScheme = preference === 'dark' ? 'dark' : 'light';
}
