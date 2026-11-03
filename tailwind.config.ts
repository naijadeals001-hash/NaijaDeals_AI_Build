import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}", "./lib/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#ffffff",
        ink: "#191c1e",
        muted: "#4B5563",
        surface: "#f8f9fb",
        "surface-low": "#f3f4f6",
        "surface-mid": "#edeef0",
        "border-soft": "#d8dfd8",
        primary: "#006d38",
        "primary-live": "#00a859",
        "primary-soft": "#e7f8ed",
        amber: "#F59E0B",
        "amber-strong": "#B45309",
        "amber-soft": "#FEF3C7",
        crimson: "#EF4444",
        "crimson-soft": "#FEE2E2",
        night: "#101418"
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Plus Jakarta Sans", "Inter", "system-ui", "sans-serif"]
      },
      boxShadow: {
        soft: "0 18px 50px rgba(16, 24, 40, 0.08)",
        lift: "0 10px 28px rgba(0, 109, 56, 0.12)"
      }
    }
  },
  plugins: []
};

export default config;
