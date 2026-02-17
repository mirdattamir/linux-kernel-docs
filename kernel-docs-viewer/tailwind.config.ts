import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        syscall: {
          DEFAULT: 'rgb(59 130 246)',
          light: 'rgb(96 165 250)',
          dark: 'rgb(37 99 235)',
        },
        kernel: {
          DEFAULT: 'rgb(34 197 94)',
          light: 'rgb(74 222 128)',
          dark: 'rgb(22 163 74)',
        },
        driver: {
          DEFAULT: 'rgb(168 85 247)',
          light: 'rgb(192 132 252)',
          dark: 'rgb(147 51 234)',
        },
        hardware: {
          DEFAULT: 'rgb(239 68 68)',
          light: 'rgb(248 113 113)',
          dark: 'rgb(220 38 38)',
        },
        userspace: {
          DEFAULT: 'rgb(107 114 128)',
          light: 'rgb(156 163 175)',
          dark: 'rgb(75 85 99)',
        },
      },
      animation: {
        'flow-pulse': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};

export default config;
