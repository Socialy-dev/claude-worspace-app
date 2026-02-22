/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        claude: {
          bg: '#1a1a2e',
          surface: '#16213e',
          panel: '#0f3460',
          accent: '#e94560',
          text: '#eee',
          muted: '#8892b0',
          green: '#64ffda',
          orange: '#f4845f',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'SF Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
