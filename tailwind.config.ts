import type { Config } from 'tailwindcss'
import typography from '@tailwindcss/typography'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ['"Junicode"', '"EB Garamond"', 'Georgia', 'serif'],
        display: ['"IM Fell English"', '"Junicode"', 'Georgia', 'serif'],
      },
    },
  },
  // An import, not require(): newer Node loads this .ts file as an ES module,
  // where require is undefined and `next dev` crashed compiling CSS (25 Nov 2026).
  plugins: [typography],
}

export default config
