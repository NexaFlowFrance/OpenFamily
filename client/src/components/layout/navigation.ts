import {
    Home,
    ShoppingCart,
    CheckSquare,
    Calendar as CalendarIcon,
    CalendarDays,
    ChefHat,
    UtensilsCrossed,
    Wallet,
    Users,
    Settings,
    Plug,
    PiggyBank,
    MessageSquare,
    LayoutGrid,
} from 'lucide-react';

export interface NavItem {
    labelKey: string;
    href: string;
    icon: typeof Home;
    /** An optional module the family can switch off (see TOGGLEABLE_MODULES on the server). */
    module?: string;
}

// Every section of the app, in the order of the sidebar. Entries without a
// `module` are always on and can never be hidden.
export const NAVIGATION: NavItem[] = [
    { labelKey: 'items.today', href: '/', icon: Home },
    { labelKey: 'items.shopping', href: '/shopping', icon: ShoppingCart },
    { labelKey: 'items.tasks', href: '/tasks', icon: CheckSquare },
    { labelKey: 'items.posts', href: '/posts', icon: MessageSquare },
    { labelKey: 'items.rewards', href: '/rewards', icon: PiggyBank, module: 'rewards' },
    { labelKey: 'items.calendar', href: '/calendar', icon: CalendarIcon },
    { labelKey: 'items.planning', href: '/planning', icon: CalendarDays, module: 'planning' },
    { labelKey: 'items.recipes', href: '/recipes', icon: ChefHat, module: 'recipes' },
    { labelKey: 'items.meals', href: '/meal-planning', icon: UtensilsCrossed, module: 'meals' },
    { labelKey: 'items.budget', href: '/budget', icon: Wallet, module: 'budget' },
    { labelKey: 'items.family', href: '/family', icon: Users },
    { labelKey: 'items.integrations', href: '/integrations', icon: Plug, module: 'integrations' },
    { labelKey: 'items.settings', href: '/settings', icon: Settings },
];

// On a phone, the bottom bar keeps what a family opens every day under the
// thumb: today, the calendar, the tasks, the shopping list. Everything else is
// one tap further, behind "More", laid out like the apps of a home screen.
export const MOBILE_TABS: NavItem[] = [
    { labelKey: 'mobile.home', href: '/', icon: Home },
    { labelKey: 'mobile.calendar', href: '/calendar', icon: CalendarIcon },
    { labelKey: 'mobile.tasks', href: '/tasks', icon: CheckSquare },
    { labelKey: 'mobile.shopping', href: '/shopping', icon: ShoppingCart },
];

export const MORE_TAB: NavItem = { labelKey: 'mobile.more', href: '/more', icon: LayoutGrid };

export const isRouteActive = (pathname: string, href: string): boolean => {
    if (href === '/') {
        return pathname === '/';
    }
    return pathname === href || pathname.startsWith(`${href}/`);
};

/** True when the page shown has a tab of its own in the bottom bar. */
export const isOnMobileTab = (pathname: string): boolean =>
    MOBILE_TABS.some((tab) => isRouteActive(pathname, tab.href));

/** What "More" holds: every section without a tab of its own. */
export const moreItems = (): NavItem[] =>
    NAVIGATION.filter((item) => !MOBILE_TABS.some((tab) => tab.href === item.href));
