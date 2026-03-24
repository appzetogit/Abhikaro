/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      keyframes: {
        recommendationFlip: {
          "0%, 42%": { transform: "rotateX(0deg)" },
          "50%, 92%": { transform: "rotateX(-180deg)" },
          "100%": { transform: "rotateX(-180deg)" },
        },
      },
      animation: {
        "recommendation-flip": "recommendationFlip 5s ease-in-out infinite",
      },
    },
  },
}
