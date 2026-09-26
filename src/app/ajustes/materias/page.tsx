import { SubjectsConfig } from '@/components/SubjectsConfig';
import { CabeceraInterna } from '@/components/ListaDestinos';

export default function Pagina() {
  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <CabeceraInterna
        volverA="/ajustes"
        volverTexto="Configuración"
        titulo="Mis materias"
        descripcion="La materia y el código que el colegio le da a cada grado."
      />
      <SubjectsConfig />
    </main>
  );
}
