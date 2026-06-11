import {
  LayoutDashboard,
  Building2,
  Users,
  KanbanSquare,
  RefreshCw,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Phase the feature is built in — used to show a "Soon" hint for now. */
  phase: 1 | 2 | 3;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, phase: 1 },
  { label: "Companies", href: "/companies", icon: Building2, phase: 1 },
  { label: "CRM", href: "/crm", icon: KanbanSquare, phase: 1 },
  { label: "Contacts", href: "/contacts", icon: Users, phase: 1 },
  { label: "Re-Engagement", href: "/re-engagement", icon: RefreshCw, phase: 1 },
  { label: "Settings", href: "/settings", icon: Settings, phase: 1 },
];
