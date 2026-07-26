# planilla-app

Automatización del flujo docente para profesores de GLA — PWA local-first con backup en la nube.

**Deploy:** https://planillaapp.vercel.app

## Qué hace la app

**Gestión de planilla y Califica (v1):**
1. **Importar** una `PLANILLA-NOTAS-*.xlsx` con los 19 cursos y sus notas. Detección automática del layout (8°–10° vs 11°) y guardado en IndexedDB.
2. **Importar** un `Califica-XXX.xls/xlsx` consolidado del colegio (el "Califica-451") para hidratar los COD_ALUM.
3. **Editar** notas y F/R por estudiante desde una vista tipo planilla optimizada para móvil.
4. **Ver la DEF con el algoritmo real de la plataforma** (ignore-zeros + half-up), no con el que trae tu Excel — sabes quién va aprobando de verdad.
5. **Exportar** el Califica del curso preservando el formato del template, con lista viva de activos y corrección automática de typos.

**Horario, calendario y agenda (v2):**
6. **Modelo de días D1–D5 + Día Fijo** con motor que respeta festivos colombianos (Ley Emiliani auto) y cancelaciones — no consumen turno rotativo.
7. **Widget "Hoy"** en la home: qué clases toca, en qué bloque, con badge de ciclo y estado F/R por clase.
8. **Editor F/R por ciclo** — checkboxes por estudiante, con `S1/S2` separadas para 11°, botón de confirmación por sesión.
9. **Calendario mensual** con overlay de entregas/actividades por color; agregar/editar desde el mismo popover.
10. **To-do** con prioridad y vencimiento, por curso opcional.
11. **Exportador EFAS** — consolidado institucional en XLSX con hoja de Salón de Honor (estudiantes ≥80).

**Backup y multi-dispositivo (v2 completa):**
12. **Auth email OTP** vía Supabase — código de 6/8 dígitos por email (Resend SMTP).
13. **Sync Dexie ↔ Supabase** de las 11 tablas locales, last-write-wins por `updated_at`, con auto-sync cada 60s + debounce on-write de 5s.
14. **Tombstones** para que los deletes se propaguen entre dispositivos.
15. **Contador de conflictos** cuando el remoto pisa un cambio local no sincronizado.
16. **Backup/restore JSON** de toda la base local, portable y versionado (funciona incluso sin Supabase).

**Integraciones (v4):**
17. **Google Classroom read-only** — conectar cuenta, listar cursos/tareas/entregas, ver adjuntos.
18. **Link a classroom-rpa** — para descargar entregas de un ciclo por curso, se usa la app hermana [classroom-rpa.vercel.app](https://classroom-rpa.vercel.app) (link en el nav bar). La calificación de las entregas se hace manualmente por el docente en su flujo habitual.

**PWA:**
19. **Instalable en móvil** con service worker (cache app shell + persistencia de IndexedDB).

## Stack

- **Next.js 15** (App Router, RSC + Client Components donde hace falta)
- **Dexie 4** sobre IndexedDB — local-first, con hooks que autogeneran `syncId` (UUID) y `updatedAt` en cada escritura
- **Supabase** (auth OTP + sync JSONB con RLS)
- **Resend** (SMTP para OTP emails)
- **google-auth-library** — OAuth2 read-only a Classroom
- **SheetJS (xlsx)** — leer archivos Excel
- **ExcelJS** — generar Califica y EFAS preservando estilos
- **Tailwind CSS**
- **Deploy:** Vercel

## Setup local

```bash
npm install
cp .env.local.example .env.local
# Edita .env.local con tus keys
npm run dev
```

Y abres `http://localhost:3000`.

**Env vars requeridas** (ver `.env.local.example`):

| Variable | Prefijo | Notas |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `NEXT_PUBLIC_` (safe) | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `NEXT_PUBLIC_` (safe) | anon key, protegido por RLS |
| `GOOGLE_CLIENT_ID` | server-only | OAuth client de Google Cloud |
| `GOOGLE_CLIENT_SECRET` | server-only | nunca en el bundle cliente |
| `GOOGLE_REDIRECT_URI` | server-only | `http://localhost:3000/api/classroom/callback` en dev, URL de Vercel en prod |

**Supabase schema** — corre en orden en Dashboard → SQL Editor:
1. `supabase/schema.sql` (tabla `sync_records` + RLS)
2. `supabase/migrations/002_tombstones.sql` (columna `deleted_at`)

**Auth OTP** requiere SMTP custom en Supabase (el default rate-limita brutal). Config Resend en Authentication → Emails → SMTP Settings:
- Host `smtp.resend.com`, Port `465`, Username `resend`, Password `re_...`
- Editar template "Magic Link" para incluir `{{ .Token }}` (código, no solo link)
- Site URL: la URL de tu deploy. Redirect URLs: `https://tu-deploy/**`

**Google OAuth** — crear proyecto en Google Cloud Console, habilitar Classroom API, crear OAuth Client Web con redirect URIs para localhost y prod.

**Para probar el flujo rápido:**
1. Sube tu `PLANILLA-NOTAS-*.xlsx` en la sección "Importar datos"
2. Sube tu `Califica-451-*.xls` en la misma sección
3. Entra a cualquier curso → edita notas, marca F/R, exporta Califica
4. En `/classroom` conecta tu cuenta Google para ver cursos y entregas
5. Para descargar entregas de un ciclo, usa el link "Descargar entregas" del nav → abre [classroom-rpa](https://classroom-rpa.vercel.app)

## Estructura

```
src/
├── app/
│   ├── page.tsx                      # home: Hoy + Pendientes + Global dashboard + Reportes + Importar + Backup + PWA
│   ├── auth/page.tsx                 # login OTP email
│   ├── curso/[code]/page.tsx         # dashboard + editor F/R + planilla + historial
│   ├── horario/page.tsx              # config de bloques por tipo día
│   ├── calendario/page.tsx           # mensual con overlay de eventos
│   ├── pendientes/page.tsx           # to-do completo
│   ├── classroom/page.tsx            # browse cursos/tareas/entregas
│   ├── manifest.ts                   # PWA manifest
│   └── api/
│       └── classroom/                # login/callback/me/courses/coursework/submissions
├── lib/
│   ├── constants.ts                  # GRADE_META, SLOTS, escala de notas
│   ├── formula.ts                    # calcDef (strict + platform)
│   ├── importer.ts / exporter.ts     # xlsx planilla + Califica
│   ├── efasExporter.ts               # EFAS consolidado + salón de honor
│   ├── stats.ts                      # métricas de curso
│   ├── db.ts                         # Dexie v7 + hooks de sync + helpers
│   ├── sync.ts                       # push/pull/status Supabase
│   ├── supabase.ts                   # cliente browser
│   ├── schedule.ts                   # motor de días D1-D5 + Fijo
│   ├── holidays-co.ts                # festivos Colombia con Ley Emiliani
│   ├── backup.ts                     # export/import JSON de Dexie
│   ├── googleOAuth.ts                # server-only OAuth2 helpers
│   ├── classroomSession.ts           # tokens en cookie httpOnly
│   ├── classroomApi.ts               # wrapper Classroom REST v1
│   └── utils.ts                      # normalizeName, downloadBlob, etc.
├── components/                       # 25+ componentes client-side
└── types/index.ts                    # entidades con syncId + updatedAt

public/
├── templates/Califica-*.xlsx         # bases para el exportador
├── icon-192.svg / icon-512.svg       # PWA icons
└── sw.js                             # service worker

supabase/
├── schema.sql                        # tabla base + RLS
└── migrations/002_tombstones.sql
```

## Lógica de la fórmula (crítico entenderla)

Dos cálculos posibles en `formula.ts`:

**`strict`** — lo que hace tu Excel Planilla. Los 0 cuentan como notas reales. Ejemplo: si K = C4:60% + C5:40% con C4=100 y C5=0, la Def de K es 60. Con esta cuenta, mientras no hayas calificado un ciclo la DEF de todos se hunde.

**`platform`** (default) — lo que hace la plataforma del colegio. Los 0 se ignoran (no calificado). El mismo ejemplo da K = 100. **Validado 100% contra el panel real** (curso 801, jul-2026, 27/27 matches).

1. Por categoría: promedio ponderado reescalando los pesos entre las subnotas > 0
2. Definitiva: promedio simple de las categorías con Def > 0
3. Redondeo: half-up (no banker's)

### Pesos internos por categoría

Cada categoría K/M/U/C/E pesa 20% de la DEF final. Los pesos DENTRO cambian entre 8°–10° y 11°:

| Categoría | 8°–10° | 11° |
|---|---|---|
| KNOWLEDGE | C4:60 + C5:40 | C2:60 + C4:40 |
| METHOD | C6:50 + C8:50 | C3:40 + C6:60 |
| USE | C2:50 + C9:50 | C5:25 + C8:50 + C9:25 |
| COMMUNICATION | C3:25 + C4:25 + C5:50 | C3:25 + C4:25 + C6:50 |
| EV | C7:100 | C7:100 |

## Modelo de datos (Dexie v7)

Ver `src/types/index.ts`. Cada `Student` guarda:
- Metadata (codAlum, nombre, orden, activeFrom, withdrawnAt)
- `cycles[9]` — para 8°–10° son `{F, R, nota, obs}`; para 11° incluyen también `S1` y `S2` (cada una con F/R/N)
- `subnotas` — diccionario con 10 o 11 claves según el grado

**Sync metadata** (agregado por hooks automáticamente):
- `syncId` — UUID estable cross-device
- `updatedAt` — ISO timestamp del último cambio local (base de LWW)

**Deletes:** los estudiantes retirados NO se borran, se marcan con `withdrawnAt` (soft). El resto de tablas se borran duro, pero el hook `deleting` encola una tombstone en la tabla local `syncTombstones` que se propaga a Supabase para multi-dispositivo.

**Sync flow:**
1. Cada escritura Dexie bumpea `updatedAt` (hook `updating`)
2. `pushAll(userId)` sube todas las filas donde `updatedAt > lastPush`, luego las tombstones
3. `pullAll(userId)` baja las filas remotas con `updated_at > lastPull`, LWW merge, aplica tombstones remotas como deletes locales
4. `SyncStatus` en el nav bar dispara sync manual + auto cada 60s + on-write debounce 5s

## Roadmap

### v1 ✅ (importar / editar / exportar)
### v2 ✅ (horario + calendario + F/R + EFAS + auth + sync)
### v3 ✅ (to-do + calendario de entregas + PWA install)
### v4.0 ✅ (Google Classroom read-only + link a classroom-rpa para descarga de entregas)

### Descartado
- **Agente IA calificador con Claude** — quitado en 2026-07-26. La calificación se hace manualmente; la descarga de entregas se delega a [classroom-rpa](https://classroom-rpa.vercel.app).

### v4.1+ (candidatos)
- [ ] Push notifications VAPID (v3 opcional)
- [ ] Verificar dominio propio en Resend para envío multi-usuario
- [ ] Resolución manual de conflictos de sync per-row

## Notas heredadas del análisis original

- **19 cursos, 539 estudiantes activos** confirmados contra hoja EFAS
- **Trimestre 2 arrancó 2026-04-29** — actualizar `trim3Start` en `/calendario` cuando arranque T3
- **Aulas por defecto: "Informática"** — cambiar 10° a "Robótica" cuando arranque T3
- **La Planilla del docente tiene 3 fórmulas mal en 11°** (Zambrano Guzmán 1101, Zambrano Salazar 1102, Villamil Beltrán 1103). El importador toma las subnotas correctas; el cálculo en la app siempre pasa por `formula.ts`.
- **Ingresos posteriores al Califica-451** salen con `FALTA_COD_ALUM`. Hoy: Guerrero Montaña Mariana Isabel (903).
