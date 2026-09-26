import { ImportHistorial } from '@/components/ImportHistorial';
import { CabeceraInterna } from '@/components/ListaDestinos';

/**
 * Lo que queda por traer a mano.
 *
 * Eran cuatro importadores y quedó uno. Los otros tres se fueron por la misma
 * razón: había un camino mejor para lo mismo.
 *
 * - **La Planilla del año** era el Excel con el que Diego llevaba sus notas.
 *   Ningún otro docente la tiene, y él dejó de usarla. El Califica de todos
 *   los cursos ya crea los cursos con sus estudiantes desde cero.
 * - **Los códigos de los estudiantes** los escribe solo ese mismo Califica, que
 *   los trae adentro. El importador pedía un archivo del extractor, o sea
 *   Tampermonkey, para hacer lo que ya pasaba sin pedir nada. Lo que sí valía
 *   —quién no cuadra entre la app y la plataforma— se quedó, ahora se ve al
 *   subir el Califica.
 * - **Los porcentajes** se traen desde la matriz de actividades, que además
 *   deja editarlos. Tenerlos acá era una segunda puerta a lo mismo.
 */
export default function TraerPage() {
  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <CabeceraInterna
        volverA="/ajustes"
        volverTexto="Configuración"
        titulo="Notas de trimestres anteriores"
        descripcion="Solo si empezaste a usar la app con el año ya empezado."
      />
      <section className="border rounded-lg p-4 bg-neutral-50">
        <ImportHistorial />
      </section>
    </main>
  );
}
