import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Graph paper theme colors
        paper: {
          bg: "#f8f9fa",
          line: "#e0e7ef",
          lineDark: "#c5d1de",
        },
        highlighter: {
          yellow: "#fff176",
          yellowDark: "#fdd835",
          green: "#a5d6a7",
          pink: "#f8bbd9",
        },
        ink: {
          DEFAULT: "#1a2332",
          light: "#4a5568",
          muted: "#718096",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        handwriting: ["var(--font-patrick-hand)", "cursive"],
      },
      backgroundImage: {
        "graph-paper":
          "linear-gradient(to right, var(--paper-line) 1px, transparent 1px), linear-gradient(to bottom, var(--paper-line) 1px, transparent 1px)",
      },
    },
  },
  plugins: [],
};

export default config;
