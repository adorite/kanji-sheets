import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Frontend-only SPA — deploys to Vercel/Netlify/GitHub Pages with zero config.
export default defineConfig({
  plugins: [react()],
})
