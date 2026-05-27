/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#2D6BE4",
          hover: "#1D52B8",
          light: "#EAF0FC",
        },
        warningRed: {
          DEFAULT: "#E84D4D",
          hover: "#C93B3B",
        },
        successGreen: {
          DEFAULT: "#2ECC71",
          hover: "#25A25A",
        },
        terminalBg: "#1A1A2E",
        terminalText: "#E0E0E0",
      },
    },
  },
  plugins: [],
}
