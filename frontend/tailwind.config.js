/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: '#0A0A0A',
        panel: '#111111',
        line: '#2A2A2A',
        dim: '#7A7A7A',
        heat1: '#E8432C',
        heat2: '#F07C2E',
        heat3: '#F5B93B',
        heat4: '#F8E14A',
        success: '#3ECF8E',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'monospace'],
        display: ['Silkscreen', 'monospace'],
      }
    },
  },
  plugins: [],
}
