import {
  BarChart3,
  Home,
  Settings,
  Shield,
  SlidersHorizontal,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

// Single source of truth for the sidebar — only "Tổng quan" (Overview) is a
// fully real page; the other five are intentionally simple placeholders
// (see ComingSoonPage) so the nav chrome matches the reference design
// without inventing functionality nothing else in the app defines yet.
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Tổng quan", icon: Home },
  { href: "/events", label: "Sự kiện bảo mật", icon: Shield },
  { href: "/statistics", label: "Thống kê chi tiết", icon: BarChart3 },
  { href: "/reports", label: "Biểu đồ & Báo cáo", icon: TrendingUp },
  { href: "/system", label: "Quản lý hệ thống", icon: SlidersHorizontal },
  { href: "/settings", label: "Cài đặt", icon: Settings },
];
