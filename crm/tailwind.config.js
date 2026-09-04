/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#F3F3F3',
        ink: '#141414',
        muted: '#8A8A8A',
        accent: {
          DEFAULT: '#FF5722',
          soft: '#FFF0EB',
          hover: '#E64A19',
        },
        card: '#FFFFFF',
        line: '#EBEBEB',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.25rem',
        '4xl': '1.5rem',
      },
      boxShadow: {
        soft: '0 4px 24px rgba(20, 20, 20, 0.06)',
        card: '0 2px 16px rgba(20, 20, 20, 0.05)',
        lift: '0 12px 40px rgba(20, 20, 20, 0.1)',
      },
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        float: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '50%': { transform: 'translate(2%, -2%) scale(1.02)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '0.45' },
          '50%': { opacity: '0.7' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.45s ease-out both',
        'fade-in': 'fade-in 0.35s ease-out both',
        'scale-in': 'scale-in 0.4s ease-out both',
        shimmer: 'shimmer 1.6s ease-in-out infinite',
        float: 'float 18s ease-in-out infinite',
        'pulse-soft': 'pulseSoft 3s ease-in-out infinite',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
