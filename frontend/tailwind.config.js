/** @type {import('tailwindcss').Config} */
export default {
  // 'class' = html element'ine .dark class'ı eklenince aktifleşir.
  // useTheme composable bunu kullanıcı tercihiyle (system/light/dark) yönetiyor;
  // sayfa render'ı öncesi inline script ile uygulanıyor (no flash).
  darkMode: 'class',
  content: [
    './components/**/*.{vue,js,ts}',
    './layouts/**/*.vue',
    './pages/**/*.vue',
    './app.vue',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#0f6e56',
          light: '#1d9e75',
          50: '#e1f5ee',
          100: '#9fe1cb',
          // Dark mode'da hafif daha açık ton — koyu zeminde kontrast için
          400: '#2eb583',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
      },
    },
  },
};
