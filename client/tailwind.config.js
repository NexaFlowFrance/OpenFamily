/** @type {import('tailwindcss').Config} */
export default {
    darkMode: ['class'],
    content: [
        './index.html',
        './src/**/*.{js,ts,jsx,tsx}',
    ],
    theme: {
        container: {
            center: true,
            padding: '1.5rem',
            screens: {
                sm: '640px',
                md: '768px',
                lg: '1024px',
                xl: '1200px',
                '2xl': '1200px',
            },
        },
        extend: {
            colors: {
                border: 'rgb(var(--border) / <alpha-value>)',
                'border-strong': 'rgb(var(--border-strong) / <alpha-value>)',
                input: 'rgb(var(--input) / <alpha-value>)',
                ring: 'rgb(var(--ring) / <alpha-value>)',
                background: 'rgb(var(--background) / <alpha-value>)',
                foreground: 'rgb(var(--foreground) / <alpha-value>)',
                surface: 'rgb(var(--surface-rgb) / <alpha-value>)',
                'surface-2': 'rgb(var(--surface-2-rgb) / <alpha-value>)',
                primary: {
                    DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
                    foreground: 'rgb(var(--primary-foreground) / <alpha-value>)',
                    hover: 'rgb(var(--primary-hover) / <alpha-value>)',
                    pressed: 'rgb(var(--primary-pressed) / <alpha-value>)',
                    soft: 'rgb(var(--primary-soft) / <alpha-value>)',
                },
                secondary: {
                    DEFAULT: 'rgb(var(--secondary) / <alpha-value>)',
                    foreground: 'rgb(var(--secondary-foreground) / <alpha-value>)',
                },
                muted: {
                    DEFAULT: 'rgb(var(--muted) / <alpha-value>)',
                    foreground: 'rgb(var(--muted-foreground) / <alpha-value>)',
                },
                accent: {
                    DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
                    foreground: 'rgb(var(--accent-foreground) / <alpha-value>)',
                },
                destructive: {
                    DEFAULT: 'rgb(var(--destructive) / <alpha-value>)',
                    foreground: 'rgb(var(--destructive-foreground) / <alpha-value>)',
                },
                success: 'rgb(var(--success) / <alpha-value>)',
                warning: 'rgb(var(--warning) / <alpha-value>)',
                danger: 'rgb(var(--danger) / <alpha-value>)',
                info: 'rgb(var(--info) / <alpha-value>)',
                card: {
                    DEFAULT: 'rgb(var(--card) / <alpha-value>)',
                    foreground: 'rgb(var(--card-foreground) / <alpha-value>)',
                },
                popover: {
                    DEFAULT: 'rgb(var(--popover) / <alpha-value>)',
                    foreground: 'rgb(var(--popover-foreground) / <alpha-value>)',
                },
                // Backward compatibility aliases for current pages.
                nexus: {
                    blue: 'rgb(var(--primary) / <alpha-value>)',
                    'blue-light': 'rgb(var(--primary-soft) / <alpha-value>)',
                    amber: 'rgb(var(--warning) / <alpha-value>)',
                    background: 'rgb(var(--background) / <alpha-value>)',
                    surface: 'rgb(var(--surface-rgb) / <alpha-value>)',
                },
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
            },
            fontSize: {
                display: ['28px', { lineHeight: '32px', fontWeight: '600' }],
                h1: ['22px', { lineHeight: '28px', fontWeight: '600' }],
                h2: ['18px', { lineHeight: '24px', fontWeight: '600' }],
                body: ['16px', { lineHeight: '24px', fontWeight: '400' }],
                caption: ['14px', { lineHeight: '20px', fontWeight: '400' }],
                micro: ['12px', { lineHeight: '16px', fontWeight: '400' }],
                // Compatibility aliases
                'body-sm': ['14px', { lineHeight: '20px', fontWeight: '400' }],
                label: ['14px', { lineHeight: '20px', fontWeight: '500' }],
                'label-sm': ['12px', { lineHeight: '16px', fontWeight: '500' }],
            },
            borderRadius: {
                card: 'var(--radius-card)',
                input: 'var(--radius-input)',
                pill: 'var(--radius-pill)',
                nexus: 'var(--radius-input)',
                'nexus-lg': 'var(--radius-card)',
                lg: 'var(--radius)',
                md: 'calc(var(--radius) - 2px)',
                sm: 'calc(var(--radius) - 4px)',
            },
            boxShadow: {
                surface: 'var(--shadow-surface)',
                'surface-hover': 'var(--shadow-surface-hover)',
                // Compatibility aliases
                'nexus-sm': 'var(--shadow-surface)',
                nexus: 'var(--shadow-surface)',
                'nexus-lg': 'var(--shadow-surface-hover)',
                'nexus-blue': '0 6px 20px rgba(255, 68, 102, 0.22)',
                'nexus-amber': '0 6px 20px rgba(245, 158, 11, 0.2)',
            },
            keyframes: {
                'accordion-down': {
                    from: { height: 0 },
                    to: { height: 'var(--radix-accordion-content-height)' },
                },
                'accordion-up': {
                    from: { height: 'var(--radix-accordion-content-height)' },
                    to: { height: 0 },
                },
                'fade-in': {
                    from: { opacity: 0 },
                    to: { opacity: 1 },
                },
                'fade-out': {
                    from: { opacity: 1 },
                    to: { opacity: 0 },
                },
                'slide-up': {
                    from: { transform: 'translateY(16px)', opacity: 0 },
                    to: { transform: 'translateY(0)', opacity: 1 },
                },
                'slide-down': {
                    from: { transform: 'translateY(-16px)', opacity: 0 },
                    to: { transform: 'translateY(0)', opacity: 1 },
                },
            },
            animation: {
                'accordion-down': 'accordion-down var(--motion-base) var(--ease-soft)',
                'accordion-up': 'accordion-up var(--motion-base) var(--ease-soft)',
                'fade-in': 'fade-in var(--motion-base) var(--ease-soft)',
                'fade-out': 'fade-out var(--motion-base) var(--ease-soft)',
                'slide-up': 'slide-up var(--motion-base) var(--ease-soft)',
                'slide-down': 'slide-down var(--motion-base) var(--ease-soft)',
            },
            transitionDuration: {
                fast: 'var(--motion-fast)',
                base: 'var(--motion-base)',
                nexus: 'var(--motion-base)',
            },
            transitionTimingFunction: {
                soft: 'var(--ease-soft)',
                nexus: 'var(--ease-soft)',
            },
        },
    },
    plugins: [],
};
