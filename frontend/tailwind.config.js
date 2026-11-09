/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        card: '0 12px 30px rgba(15, 23, 42, 0.08)',
      },
      colors: {
        brand: {
          50: '#f0f9ff',
          100: '#dff2ff',
          500: '#0f766e',
          600: '#0b5f68',
          700: '#104c68',
        },
      },
    },
  },
  plugins: [],
}

