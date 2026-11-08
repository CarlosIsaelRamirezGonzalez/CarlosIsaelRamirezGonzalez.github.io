import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// El sitio vive en la raíz del dominio de GitHub Pages, así que la base es "/".
export default defineConfig({
  plugins: [tailwindcss()],
})
