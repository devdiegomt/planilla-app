import { BackupRestore } from '@/components/BackupRestore';
import { CabeceraInterna } from '@/components/ListaDestinos';

export default function Pagina() {
  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <CabeceraInterna
        volverA="/ajustes"
        volverTexto="Configuración"
        titulo="Copia de seguridad"
        descripcion="Guarda todo en un archivo, o vuelve a uno guardado antes."
      />
      <BackupRestore />
    </main>
  );
}
