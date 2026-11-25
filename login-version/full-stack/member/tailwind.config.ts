import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{vue,ts,tsx}'],
  theme: {
    extend: {
      screens: {
        xs: '375px',
      },
      colors: {
        primary: '#1989fa',
        white: '#fff',
      },
    },
  },
  plugins: [],
} satisfies Config