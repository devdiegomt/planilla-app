import { ListaDestinos, type Destino } from '@/components/ListaDestinos';

/**
 * Configuración, como índice y no como muro.
 *
 * Era una sola página con ocho paneles abiertos a la vez, y así no hay
 * jerarquía: "Borrar los datos de este equipo" pesaba lo mismo que "Instalar
 * app", y para encontrar algo había que leerlo todo. Cada sección se mudó a su
 * propia página con el MISMO componente adentro — no cambió ninguno.
 *
 * La línea de cada destino dice **cuándo** se usa. Es lo que un docente que no
 * armó la app no tiene cómo adivinar.
 */
const DESTINOS: Destino[] = [
  {
    href: '/ajustes/materias',
    titulo: 'Mis materias',
    descripcion: 'Qué enseñas en cada grado. Se configura una vez al año.',
  },
  {
    href: '/ajustes/traer',
    titulo: 'Traer datos de la plataforma',
    descripcion: 'Tu Planilla, los códigos, las notas de trimestres pasados y los porcentajes.',
  },
  {
    href: '/ajustes/cierre',
    titulo: 'Cierre de trimestre',
    descripcion: 'Archiva las notas y deja la planilla en blanco. Tres veces al año.',
  },
  {
    href: '/ajustes/copia',
    titulo: 'Copia de seguridad',
    descripcion: 'Guarda todo en un archivo, o vuelve a uno guardado antes.',
  },
  {
    href: '/ajustes/equipo',
    titulo: 'Este equipo',
    descripcion: 'Instalar la app, los avisos, y borrar lo que este aparato guarda.',
  },
  {
    href: '/ajustes/reparar',
    titulo: 'Si algo falla',
    descripcion: 'Revisa que los datos estén sanos y repara lo que se pueda.',
  },
];

export default function AjustesPage() {
  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Configuración</h1>
        <p className="text-sm text-neutral-500">
          Puesta a punto, cierre de trimestre y copias de seguridad.
        </p>
      </header>
      <ListaDestinos destinos={DESTINOS} />
    </main>
  );
}
