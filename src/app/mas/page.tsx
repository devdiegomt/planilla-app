import { ListaDestinos, type Destino } from '@/components/ListaDestinos';

/**
 * Lo que no es de todos los días.
 *
 * La barra de abajo solo aguanta cinco pestañas cómodas, y hasta ahora tenía
 * seis: Classroom y Correos ocupaban un sitio del que no todos los docentes
 * sacan provecho. Acá caben, y acá cabe lo que venga después sin volver a
 * apretar la barra.
 */
const DESTINOS: Destino[] = [
  {
    href: '/classroom',
    titulo: 'Entregas de Classroom',
    descripcion: 'Descarga en un ZIP lo que los estudiantes subieron a un trabajo.',
  },
  {
    href: '/correos',
    titulo: 'Correos',
    descripcion: 'Escribe a los acudientes de un curso o de quienes van perdiendo.',
  },
  {
    href: '/plataforma',
    titulo: 'Plataforma del colegio',
    descripcion: 'Pasar la asistencia y traer tu matriz, sin instalar nada.',
  },
  {
    href: '/matriz',
    titulo: 'Matriz de actividades',
    descripcion: 'Qué actividad va en cada casilla, cuánto pesa y en qué ciclo cae.',
  },
  {
    href: '/ajustes',
    titulo: 'Configuración',
    descripcion: 'Tus materias, traer datos, cierre de trimestre y copias de seguridad.',
  },
];

export default function MasPage() {
  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Más</h1>
        <p className="text-sm text-neutral-500">
          Lo que no se usa todos los días, pero conviene tener a mano.
        </p>
      </header>
      <ListaDestinos destinos={DESTINOS} />
    </main>
  );
}
