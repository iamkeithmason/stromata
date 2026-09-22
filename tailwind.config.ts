import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ['"EB Garamond"', 'Georgia', 'serif'],
        display: ['"IM Fell English"', '"EB Garamond"', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}

export default config
