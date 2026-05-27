import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// GitHub Pages 배포 경로: https://hjpotterdev.github.io/igusa-crop/
export default defineConfig({
  plugins: [react()],
  base: '/igusa-crop/',
})
