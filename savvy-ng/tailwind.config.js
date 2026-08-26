/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      keyframes: {
        'dot-pulse': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '.5', transform: 'scale(1.5)' },
        },
      },
      animation: {
        'dot-pulse-slow': 'dot-pulse 1.4s ease-in-out infinite',
        'dot-pulse-fast': 'dot-pulse 0.7s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
