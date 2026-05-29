/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'var(--color-paper)',
        ink: 'var(--color-ink)',
        accent: 'var(--color-accent)',
        'accent-hover': 'var(--color-accent-hover)',
        warning: 'var(--color-warning)',
        card: 'var(--color-card)',
        'card-alt': 'var(--color-card-alt)',
        'app-border': 'var(--color-border)',
        'app-border-subtle': 'var(--color-border-subtle)',
        muted: 'var(--color-muted)',
        'muted-strong': 'var(--color-muted-strong)',
        'muted-light': 'var(--color-muted-light)',
        'input-bg': 'var(--color-input-bg)',
        'input-border': 'var(--color-input-border)',
        'success-bg': 'var(--color-success-bg)',
        'success-border': 'var(--color-success-border)',
        'error-bg': 'var(--color-error-bg)',
        'error-border': 'var(--color-error-border)',
        'error-text': 'var(--color-error-text)',
        'warn-bg': 'var(--color-warn-bg)',
        'warn-border': 'var(--color-warn-border)',
        'badge-neutral': 'var(--color-badge-neutral)',
        'badge-neutral-text': 'var(--color-badge-neutral-text)',
        'success': 'var(--color-success)',
        'badge-code': 'var(--color-badge-code)',
      },
      boxShadow: {
        soft: '0 8px 24px var(--color-shadow)',
      },
    },
  },
  plugins: [],
};
