/** @type {import('tailwindcss').Config} */
/**
 * AutoFlow design tokens.
 * Formalizes the existing dark "command-center" language (surfaces, brand
 * cyan/indigo, semantic colors, radius, elevation, motion) so screens stop
 * re-deriving literals and stay consistent.
 */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Layered surfaces (app background -> raised inputs)
        surface: {
          base: '#02040A',
          1: '#070C14',
          2: '#0A0D14',
          3: '#11161F',
          4: '#161C28',
        },
        // Text / foreground
        ink: {
          primary: '#E5E9F0',
          secondary: '#9AA7B8',
          tertiary: '#6B7A8D',
          muted: '#52606E',
        },
        // Brand accents
        brand: {
          cyan: { 400: '#22D3EE', 500: '#06B6D4', 600: '#0891B2' },
          indigo: { 400: '#818CF8', 500: '#6366F1', 600: '#4F46E5' },
        },
        // Semantic
        success: { 400: '#34D399', 500: '#10B981', 600: '#059669' },
        warning: { 400: '#FBBF24', 500: '#F59E0B', 600: '#D97706' },
        danger: { 400: '#FB7185', 500: '#F43F5E', 600: '#E11D48' },
        info: { 400: '#38BDF8', 500: '#0EA5E9', 600: '#0284C7' },
      },
      borderRadius: {
        DEFAULT: '8px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '20px',
      },
      boxShadow: {
        e1: 'inset 0 1px 1px rgba(255,255,255,0.04)',
        e2: '0 8px 30px rgba(0,0,0,0.40)',
        e3: '0 16px 48px rgba(0,0,0,0.55)',
        glow: '0 0 0 1px rgba(6,182,212,0.25), 0 0 24px rgba(6,182,212,0.10)',
      },
      transitionTimingFunction: {
        std: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      transitionDuration: {
        DEFAULT: '180ms',
      },
      keyframes: {
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-in-right': {
          '0%': { transform: 'translateX(16px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'scale-in': {
          '0%': { transform: 'scale(0.97)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.4s infinite',
        'fade-in': 'fade-in 160ms ease-out',
        'slide-in-right': 'slide-in-right 200ms cubic-bezier(0.4,0,0.2,1)',
        'scale-in': 'scale-in 140ms cubic-bezier(0.4,0,0.2,1)',
      },
    },
  },
  plugins: [],
};
