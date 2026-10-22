import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {},
  preload: {},
  renderer: { plugins: [vue()] },
})
