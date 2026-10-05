/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#080b0a',
        panel: '#0f1513',
        panel2: '#152019',
        jade: { DEFAULT: '#14574a', deep: '#0b2e27', glow: '#2fbf8f' },
        gold: { DEFAULT: '#d9b45b', light: '#f1d98f', dark: '#9c7a2e' },
        cream: '#f3ead3',
        mute: '#9aa79f',
        ruby: '#d8454f',
      },
      fontFamily: {
        display: ['Limelight', 'Georgia', 'serif'],
        body: ['"Josefin Sans"', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        rise: { from: { opacity: 0, transform: 'translateY(14px)' }, to: { opacity: 1, transform: 'none' } },
        pop: { '0%': { transform: 'scale(.9)', opacity: 0 }, '60%': { transform: 'scale(1.04)' }, '100%': { transform: 'scale(1)', opacity: 1 } },
        shimmer: { '0%,100%': { opacity: 0.55 }, '50%': { opacity: 1 } },
        fall: { '0%': { transform: 'translateY(-12vh) rotate(0deg)', opacity: 0 }, '10%': { opacity: 1 }, '100%': { transform: 'translateY(112vh) rotate(540deg)', opacity: 0.9 } },
      },
      animation: {
        rise: 'rise .5s cubic-bezier(.2,.7,.2,1) both',
        pop: 'pop .45s cubic-bezier(.2,.8,.3,1.2) both',
        shimmer: 'shimmer 2.4s ease-in-out infinite',
        fall: 'fall 6s linear infinite',
      },
    },
  },
  plugins: [],
};
