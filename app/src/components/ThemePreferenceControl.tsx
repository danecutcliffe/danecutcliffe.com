import { Monitor, Moon, Sun } from 'lucide-react';
import type { ThemePreference } from '../utils/theme';

interface ThemePreferenceControlProps {
  value: ThemePreference;
  onChange: (value: ThemePreference) => void;
}

const options: Array<{ value: ThemePreference; label: string; Icon: typeof Monitor }> = [
  { value: 'auto', label: 'Auto', Icon: Monitor },
  { value: 'light', label: 'White', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
];

export function ThemePreferenceControl({ value, onChange }: ThemePreferenceControlProps) {
  return (
    <section id="appearance" className="scroll-mt-20 rounded-md border border-app-border bg-card p-4 shadow-soft">
      <h3 className="text-lg font-bold">Appearance</h3>
      <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label="Appearance mode">
        {options.map(({ value: optionValue, label, Icon }) => {
          const isSelected = value === optionValue;
          return (
            <button
              key={optionValue}
              className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-md border px-3 text-sm font-bold transition ${
                isSelected ? 'border-accent bg-accent text-white' : 'border-input-border bg-card text-muted-strong hover:bg-card-alt'
              }`}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onChange(optionValue)}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
