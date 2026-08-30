/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bn: {
          green: '#2EBD85',
          red: '#F6465D',
          bg: '#FFFFFF',
          card: '#FFFFFF',
          faint: '#FAFAFA',
          input: '#F5F5F5',
          yellow: '#FCD535',
          muted: '#707A8A',
          hint: '#929AA5',
          line: '#EAECEF',
          text: '#1E2329',
          dash: '#C7CCD3',
          depthBuy: '#EBF9F4',
          depthAsk: '#FDEDF0',
        },
      },
      fontFamily: {
        sans: [
          'BinanceNova',
          '-apple-system',
          '"PingFang SC"',
          '"Microsoft YaHei"',
          'Arial',
          'sans-serif',
        ],
      },
      borderRadius: {
        sheet: '16px',
      },
      keyframes: {
        pulseRed: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' },
        },
        flashLiq: {
          '0%': { opacity: '0' },
          '15%': { opacity: '1' },
          '100%': { opacity: '1' },
        },
        sheetUp: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
      },
      animation: {
        pulseRed: 'pulseRed 0.8s ease-in-out infinite',
        flashLiq: 'flashLiq 0.4s ease-out',
        sheetUp: 'sheetUp 0.22s ease-out',
      },
    },
  },
  plugins: [],
};
