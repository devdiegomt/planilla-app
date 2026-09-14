# planilla-app — contexto para Claude

App de Diego Mayorga, docente de informática del Colegio GLA (Colombia), para sus
19 cursos de 8° a 11°. Next.js 15 (App Router) + Dexie (IndexedDB, local-first) +
Supabase (auth OTP y sync) + Vercel (deploy, crons, push VAPID).

## Comandos

- `npm run dev` — servidor de desarrollo
- `npx tsc --noEmit` — typecheck. No hay runner de tests ni ESLint configurado.
- Deploy: push a `main` → Vercel.

## Cómo trabajar con Diego

- Chat, UI y comentarios en español; identificadores en inglés.
- Alcance pequeño y entregable; proponer una opción recomendada en vez de muchas preguntas.
- Diego hace los commits: no commitear sin que lo pida.
- Probar con datos sintéticos en IndexedDB desde el navegador y **borrarlos siempre al
  terminar**. Nunca dejar filas de prueba en su base.
- Secretos solo en servidor: nunca con prefijo `NEXT_PUBLIC_`.

## Invariantes que ya costaron bugs

- **Relaciones por `courseCode` / `studentSyncId`, nunca por `courseId` / `studentId`.**
  Los ids de Dexie son locales y `stripLocalMeta` los borra antes de subir; del lado
  del servidor comparar `courseId` da `undefined === undefined`.
- **syncId deterministas** (`lib/syncId.ts`): el mismo curso o estudiante produce el
  mismo UUID en cualquier dispositivo. Reimportar no debe duplicar.
- **Migraciones Dexie:** nunca modificar una versión existente. Siempre una versión
  nueva que repita todos los stores.
- **Tabla sincronizable nueva** = registrarla en tres lugares: `SYNCABLE` (hooks en
  `lib/db.ts`), `SYNCABLE_TABLES` (`lib/sync.ts`) y `TABLES` (`lib/backup.ts`).
- **El ciclo es de la rotación, no del curso** (`lib/cycles.ts`). Un ciclo es una vuelta
  D1→D5; el viernes (FIJO) no consume rotación y pertenece al ciclo en curso, así que un
  ciclo puede traer dos viernes. No asumir `grade === 11 ? 2 : 1` sesiones: usar
  `sessionDatesOf`. Verificado contra el cronograma real del colegio.
- **La rotación es continua:** `computeDayTypes` no la reinicia por trimestre. El primer
  día de cada trimestre se fuerza a D1 desde `/calendario`, y las semanas sin clase se
  marcan; si no, la numeración de ciclos se corre.
- **Notas:** `0` = sin calificar (el algoritmo de la plataforma lo ignora); `30` =
  `NOTA_MIN`, la nota mínima real. Aprobación 70, experto 80.
- **Asistencia:** banderas `F`/`Fj`/`R`/`Rj`. Si el ciclo trae dos clases del curso,
  marcas, razones y confirmación van por sesión (`S1`/`S2`). `arrived` no se exporta.
- **Export Califica:** la cabecera de la plantilla se valida contra `SLOTS_*` antes de
  escribir (`lib/califica.ts`); se escribe posicionalmente.
- **Service worker:** no se registra en desarrollo. En producción va versionado por
  deploy y valida el tipo de lo que guarda. La guardia de arranque inline
  (`lib/recovery.ts`) repara sin tocar IndexedDB.

## Integraciones

- **planilla-v2** (userscripts sobre Classroom Live): el JSON de `codalum-extractor`
  hidrata `Student.codAlum`; la app exporta el JSON de `asistencia-autofill`, sin
  `fecha` porque la pone la plataforma.
- Cronograma, horario y detalle por módulo: ver `README.md`.
