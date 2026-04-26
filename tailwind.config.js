/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('nativewind/preset')],
  content: ['./App.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        oat: '#f5efe4',
        pine: '#18332a',
        moss: '#5d7a63',
        clay: '#c86b4a',
        butter: '#f0c978',
        ink: '#17221d',
      },
      fontFamily: {
        display: ['Georgia'],
        body: ['System'],
      },
      boxShadow: {
        card: '0 10px 24px rgba(23,34,29,0.08)',
      },
    },
  },
  plugins: [],
};
