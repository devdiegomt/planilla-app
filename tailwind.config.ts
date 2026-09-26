import type { Config } from 'tailwindcss';

/**
 * Los tokens viven en `globals.css` como variables; acá se les da nombre para
 * poder usarlos como clases de Tailwind (`bg-superficie`, `text-tinta-suave`).
 *
 * `neutral` se redefine a propósito: la app ya tenía 136 usos de `bg-white` y
 * `bg-neutral-50`, y reapuntarlos desde acá cambia el tono de todo sin tocar
 * doscientas clases a mano. El gris pasa a tener una pizca de tibieza, que es
 * lo que lo saca del gris de plantilla.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        fondo: 'hsl(var(--fondo))',
        superficie: 'hsl(var(--superficie))',
        hundido: 'hsl(var(--hundido))',
        borde: 'hsl(var(--borde))',
        tinta: {
          DEFAULT: 'hsl(var(--tinta))',
          suave: 'hsl(var(--tinta-suave))',
          tenue: 'hsl(var(--tinta-tenue))',
        },
        acento: {
          DEFAULT: 'hsl(var(--acento))',
          claro: 'hsl(var(--acento-claro))',
          tinta: 'hsl(var(--acento-tinta))',
        },
        neutral: {
          50:  '#faf9f7',
          100: '#f3f1ed',
          200: '#e7e4dd',
          300: '#d4d0c7',
          400: '#a3a096',
          500: '#78756c',
          600: '#5b5952',
          700: '#454340',
          800: '#2b2a28',
          900: '#1a1a19',
          950: '#0f0f0e',
        },
      },
      borderRadius: { lg: '0.75rem', md: '0.5rem' },
      boxShadow: {
        tarjeta: '0 1px 2px rgba(26,26,25,.04), 0 1px 3px rgba(26,26,25,.06)',
        alzado: '0 2px 4px rgba(26,26,25,.05), 0 4px 12px rgba(26,26,25,.08)',
      },
    },
  },
  plugins: [],
};
export default config;
