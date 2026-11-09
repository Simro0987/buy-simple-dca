import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },

        /* ── Web3 "Deep Space" palette ───────────────────────────────── */
        // Backgrounds
        'space':       { DEFAULT: '#050505', soft: '#0A0A0F', card: '#0F0F1A' },
        // Neon accents
        'neon-purple': { DEFAULT: '#9945FF', glow: '#9945FF40', soft: '#9945FF20' },
        'neon-green':  { DEFAULT: '#14F195', glow: '#14F19540', soft: '#14F19520' },
        'neon-magenta':{ DEFAULT: '#FF007A', glow: '#FF007A40', soft: '#FF007A20' },
        'neon-cyan':   { DEFAULT: '#00E5FF', glow: '#00E5FF40', soft: '#00E5FF20' },
        'neon-gold':   { DEFAULT: '#FFB800', glow: '#FFB80040', soft: '#FFB80020' },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        gain: "hsl(var(--gain))",
        loss: "hsl(var(--loss))",
        warning: "hsl(var(--warning))",
        nav: {
          bg: "hsl(var(--nav-bg))",
          active: "hsl(var(--nav-active))",
          inactive: "hsl(var(--nav-inactive))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        "4xl": "2rem",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "shimmer": {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "0.8" },
        },
        /* ── Web3 glow animations ──────────────────────────────────── */
        "glow-pulse-purple": {
          "0%, 100%": { boxShadow: "0 0 8px 1px #9945FF40" },
          "50%":       { boxShadow: "0 0 20px 4px #9945FF80" },
        },
        "glow-pulse-green": {
          "0%, 100%": { boxShadow: "0 0 8px 1px #14F19540" },
          "50%":       { boxShadow: "0 0 20px 4px #14F19580" },
        },
        "glow-pulse-magenta": {
          "0%, 100%": { boxShadow: "0 0 8px 1px #FF007A40" },
          "50%":       { boxShadow: "0 0 20px 4px #FF007A80" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%":       { transform: "translateY(-4px)" },
        },
      },
      animation: {
        "accordion-down":       "accordion-down 0.2s ease-out",
        "accordion-up":         "accordion-up 0.2s ease-out",
        "fade-in-up":           "fade-in-up 0.4s ease-out both",
        "shimmer":              "shimmer 2s linear infinite",
        "pulse-glow":           "pulse-glow 2.5s ease-in-out infinite",
        "glow-pulse-purple":    "glow-pulse-purple 2.5s ease-in-out infinite",
        "glow-pulse-green":     "glow-pulse-green  2.5s ease-in-out infinite",
        "glow-pulse-magenta":   "glow-pulse-magenta 2.5s ease-in-out infinite",
        "float":                "float 3s ease-in-out infinite",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
