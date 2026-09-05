import { EmailGenerator } from '@/components/EmailGenerator';

export default function CorreosPage() {
  return (
    <main className="max-w-5xl mx-auto p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Correos de seguimiento</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Genera el texto para escribirle a la casa cuando hay reincidencia. El
          correo del estudiante es el canal; las razones salen de las
          observaciones que ya escribiste en la planilla y en la asistencia.
        </p>
      </div>
      <EmailGenerator />
    </main>
  );
}
