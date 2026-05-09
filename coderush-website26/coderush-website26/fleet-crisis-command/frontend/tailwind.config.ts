import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        midnight: "#020617",
        ink: "#0b1224",
        steel: "#1e293b",
        cyan: "#22d3ee",
        blaze: "#f87171",
        lime: "#4ade80",
      },
      fontFamily: {
        sans: ["var(--font-space)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        neon: "0 0 20px rgba(34,211,238,0.55)",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
