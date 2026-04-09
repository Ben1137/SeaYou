/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './src/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './hooks/**/*.{js,ts,jsx,tsx}',
    './utils/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class', // Uses class-based dark mode (ThemeContext adds 'dark' class)
  theme: {
    extend: {
      colors: {
        // Deep Ocean Theme (Light Mode)
        ocean: {
          dark: 'var(--color-ocean-dark)',    // #031e3d - card backgrounds
          base: 'var(--color-ocean-base)',    // #082d5d - main app background (Madison)
          border: 'var(--color-ocean-border)', // #01658d - borders
          teal: 'var(--color-ocean-teal)',    // #008d8d - buttons/accents
          aqua: 'var(--color-ocean-aqua)',    // #54E0CA - text highlights/icons
        },
        // Night Watch Theme (Dark Mode)
        night: {
          950: 'var(--color-night-950)', // #020617 - slate-950
          900: 'var(--color-night-900)', // #0f172a - slate-900
          800: 'var(--color-night-800)', // #1e293b - slate-800
        },
      },
    },
  },
  plugins: [],
}
