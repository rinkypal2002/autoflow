import {
  LayoutDashboard,
  FolderTree,
  Workflow,
  LayoutGrid,
  Bot,
  Cpu,
  Settings,
  type LucideIcon,
} from 'lucide-react';

/**
 * Single source of truth for AutoFlow navigation.
 *
 * The app shell renders these groups; pages no longer define their own nav.
 * `match` lets a nav item stay highlighted on nested routes (e.g. Builder
 * under /workspace/editor).
 */
export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  path: string;
  /** Extra path prefixes that should highlight this item. */
  match?: string[];
  comingSoon?: boolean;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'workspace',
    label: 'Workspace',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/' },
      {
        id: 'directory',
        label: 'Directory',
        icon: FolderTree,
        path: '/workspace',
        match: ['/workspace'],
      },
      {
        id: 'builder',
        label: 'Builder',
        icon: Workflow,
        path: '/workspace/editor',
        match: ['/workspace/editor'],
      },
    ],
  },
  {
    id: 'automation',
    label: 'Automation',
    items: [
      { id: 'catalogue', label: 'Catalogue', icon: LayoutGrid, path: '/catalogue' },
      { id: 'agents', label: 'Agents', icon: Bot, path: '/agents', match: ['/agents'] },
    ],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      { id: 'engine', label: 'Engine Monitor', icon: Cpu, path: '/system/engine-monitor', match: ['/system/engine-monitor'] },
      { id: 'settings', label: 'Settings', icon: Settings, path: '/settings', comingSoon: true },
    ],
  },
];

/** Flat list for breadcrumb / active-state resolution. */
export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

export const BRAND = {
  name: 'AutoFlow',
  tagline: 'Automation platform',
} as const;

/** Resolve the active nav item for a pathname (longest match wins). */
export function resolveActiveNav(pathname: string): NavItem | undefined {
  let best: NavItem | undefined;
  let bestLen = -1;
  for (const item of ALL_NAV_ITEMS) {
    const candidates = [item.path, ...(item.match ?? [])];
    for (const c of candidates) {
      const isMatch = c === '/' ? pathname === '/' : pathname === c || pathname.startsWith(c + '/');
      if (isMatch && c.length > bestLen) {
        best = item;
        bestLen = c.length;
      }
    }
  }
  return best;
}


