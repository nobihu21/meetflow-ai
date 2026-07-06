/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        indigoElectric: '#6366F1',
        violetDeep: '#4338CA',
        cyanFlash: '#06B6D4',
        coolSlate: '#F0F0FF',
        sidebar: '#1E1B4B'
      },
      boxShadow: {
        indigo: '0 18px 48px rgba(99, 102, 241, 0.16)'
      }
    }
  },
  plugins: []
};
