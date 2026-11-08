import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

export default {
  // Hover styles only on devices with a mouse, so cards and buttons don't stay "hovered" after a tap on phones.
  future: { hoverOnlyWhenSupported: true },
  content: ["./src/components/**/*.{ts,tsx}", "./src/app/**/*.{ts,tsx}", "./src/lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Brand: dental teal, the only colour on a black, white and grey base. 600 (#0d9488) is the main accent.
        brand: {
          50: "#f0fdfa",
          100: "#ccfbf1",
          200: "#99f6e4",
          300: "#5eead4",
          400: "#2dd4bf",
          500: "#14b8a6",
          600: "#0d9488",
          700: "#0f766e",
          800: "#115e59",
          900: "#134e4a",
          950: "#042f2e",
        },
        // Near-black for the sidebar and dark sections.
        ink: {
          DEFAULT: "#0a0a0a",
          soft: "#171717",
        },
        // Light grey page background, so white cards stand out.
        canvas: "#f5f5f5",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-jakarta)", "var(--font-inter)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgb(0 0 0 / 0.04), 0 2px 8px -2px rgb(0 0 0 / 0.06)",
        lift: "0 2px 4px rgb(0 0 0 / 0.04), 0 16px 32px -12px rgb(0 0 0 / 0.18)",
        pop: "0 24px 64px -16px rgb(0 0 0 / 0.35)",
        glow: "0 0 0 1px rgb(13 148 136 / 0.2), 0 10px 32px -10px rgb(13 148 136 / 0.5)",
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          from: { backgroundPosition: "200% 0" },
          to: { backgroundPosition: "-200% 0" },
        },
        // Moves fast at first, then slows, so short loads look done and long ones still show progress.
        "nav-progress": {
          "0%": { width: "0%" },
          "20%": { width: "45%" },
          "60%": { width: "75%" },
          "100%": { width: "92%" },
        },
      },
      animation: {
        "nav-progress": "nav-progress 2.5s cubic-bezier(0.1, 0.7, 0.3, 1) forwards",
        "fade-up": "fade-up 0.35s ease-out both",
        shimmer: "shimmer 1.6s linear infinite",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
