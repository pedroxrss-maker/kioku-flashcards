import { BarChart3, House, Layers, Settings, Trophy } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItemDef {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Accent color for the item's icon block in the sidebar. */
  color: string;
  end?: boolean;
}

export const NAV_ITEMS: NavItemDef[] = [
  { to: '/', label: 'Início', icon: House, color: '#ef4444', end: true },
  { to: '/decks', label: 'Biblioteca', icon: Layers, color: '#6366f1' },
  { to: '/stats', label: 'Estatísticas', icon: BarChart3, color: '#14b8a6' },
  { to: '/conquistas', label: 'Conquistas', icon: Trophy, color: '#f59e0b' },
  { to: '/settings', label: 'Configurações', icon: Settings, color: '#a855f7' },
];

export const APP_VERSION = 'v1.0.0';
