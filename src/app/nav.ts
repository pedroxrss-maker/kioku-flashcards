import { BarChart3, House, Layers, Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItemDef {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export const NAV_ITEMS: NavItemDef[] = [
  { to: '/', label: 'Início', icon: House, end: true },
  { to: '/decks', label: 'Meus decks', icon: Layers },
  { to: '/stats', label: 'Estatísticas', icon: BarChart3 },
  { to: '/settings', label: 'Configurações', icon: Settings },
];

export const APP_VERSION = 'v1.0.0';
