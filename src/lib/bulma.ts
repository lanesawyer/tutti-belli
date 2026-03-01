const COLORS = ['black', 'dark', 'light', 'white', 'primary', 'link', 'info', 'success', 'warning', 'danger'] as const;

export type Color = typeof COLORS[number];

export function isColor(value: string): value is Color {
  return (COLORS as readonly string[]).includes(value);
}
