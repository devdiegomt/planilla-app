import type { Config } from 'tailwindcss';

/**
 * Los tokens viven en `globals.css` como variables; acá se les da nombre.
 *
 * **La escala de color entera apunta a variables**, y eso es lo que hace
 * posible el modo oscuro sin escribir un solo `dark:`. La app usa más de
 * setecientas clases de color; `bg-neutral-50` no apunta a un gris claro sino
 * a `--n50`, y en oscuro esa variable vale un gris oscuro. Las setecientas
 * voltean solas.
 *
 * Las tripletas van con `<alpha-value>` para que los modificadores de opacidad
 * sigan sirviendo: la cabecera usa `bg-superficie/85`.
 */
const v = (nombre: string) => `rgb(var(--${nombre}) / <alpha-value>)`;

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        fondo: v('fondo'),
        superficie: v('superficie'),
        hundido: v('hundido'),
        borde: v('borde'),
        'sobre-color': v('sobre-color'),
        tinta: {
          DEFAULT: v('tinta'),
          suave: v('tinta-suave'),
          tenue: v('tinta-tenue'),
        },
        acento: {
          DEFAULT: v('acento'),
          claro: v('acento-claro'),
          tinta: v('acento-tinta'),
        },
        neutral: {
          50: v('n50'), 100: v('n100'), 200: v('n200'), 300: v('n300'),
          400: v('n400'), 500: v('n500'), 600: v('n600'), 700: v('n700'),
          800: v('n800'), 900: v('n900'), 950: v('n950'),
        },
        // Los estados. Solo los tonos que la app usa de verdad: definir los
        // once de cada familia sería inventar diez valores por color que nadie
        // va a mirar nunca, y cada uno es una decisión que puede estar mal.
        amber: {
          50: v('a50'), 100: v('a100'), 200: v('a200'), 300: v('a300'),
          400: v('a400'), 500: v('a500'), 600: v('a600'), 700: v('a700'),
          800: v('a800'), 900: v('a900'),
        },
        red: {
          50: v('r50'), 100: v('r100'), 200: v('r200'), 300: v('r300'),
          400: v('r400'), 500: v('r500'), 600: v('r600'), 700: v('r700'),
          800: v('r800'), 900: v('r900'),
        },
        green: {
          50: v('v50'), 100: v('v100'), 200: v('v200'), 300: v('v300'),
          400: v('v400'), 500: v('v500'), 700: v('v700'), 800: v('v800'),
          900: v('v900'),
        },
        blue: {
          50: v('z50'), 100: v('z100'), 500: v('z500'),
          700: v('z700'), 800: v('z800'),
        },
      },
      borderRadius: { lg: '0.75rem', md: '0.5rem' },
      boxShadow: {
        tarjeta: '0 1px 2px rgb(0 0 0 /.04), 0 1px 3px rgb(0 0 0 /.06)',
        alzado: '0 2px 4px rgb(0 0 0 /.05), 0 4px 12px rgb(0 0 0 /.08)',
      },
    },
  },
  plugins: [],
};
export default config;
