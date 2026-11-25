/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{vue,ts,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        panel: '0 8px 30px rgba(15, 23, 42, 0.08)'
      }
    }
  },
  plugins: []
};
