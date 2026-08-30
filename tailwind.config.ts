import type { Config } from "tailwindcss";

// Preserva a identidade visual já estabelecida no protótipo HTML
// (verde profundo, dourado, tons de pedra, tipografia editorial),
// conforme recomendado no plano — secção 20.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        emerald: {
          950: "#0a2e2b",
          900: "#0f3d3a",
          800: "#155450",
          700: "#1c6b64",
        },
        gold: {
          300: "#e0c78a",
          500: "#c6a15b",
        },
        stone: {
          50: "#f7f4ea",
          100: "#efe9dc",
        },
        ink: {
          900: "#1b1b16",
        },
        maroon: {
          600: "#8c3b3b",
        },
        okgreen: {
          DEFAULT: "#3a7a5c",
        },
      },
      fontFamily: {
        display: ["var(--font-newsreader)", "serif"],
        sans: ["var(--font-work-sans)", "sans-serif"],
        mono: ["var(--font-ibm-plex-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
