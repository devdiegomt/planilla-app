import { ClassroomBrowser } from '@/components/ClassroomBrowser';

export default function ClassroomPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Google Classroom</h1>
        <p className="text-sm text-neutral-500">
          Solo lectura de tus cursos, tareas y entregas de estudiantes.
        </p>
      </header>
      <ClassroomBrowser searchParams={searchParams} />
    </main>
  );
}
