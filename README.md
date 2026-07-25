# planilla-app

Automatización de planillas y Califica para docentes de GLA — v1 (MVP local-first).

## Qué hace este MVP

1. **Importar** una `PLANILLA-NOTAS-*.xlsx` con los 19 cursos y sus notas. Se detecta automáticamente el layout (8°–10° vs 11°) y se guarda en IndexedDB.
2. **Importar** un `Califica-XXX.xls/xlsx` consolidado del colegio (el "Califica-451") para hidratar los COD_ALUM de cada estudiante.
3. **Editar** notas y F/R por estudiante desde una vista tipo planilla optimizada para móvil.
4. **Ver la DEF calculada con el algoritmo real de la plataforma** (ignore-zeros + half-up), no con el que trae tu Excel — de una sacas quién va aprobando de verdad.
5. **Exportar** el Califica actualizado del curso, listo para subir a la plataforma del colegio. Preserva el formato del archivo original y refleja siempre la lista viva (sin retirados). Los typos de nombre se corrigen automáticamente contra el consolidado del colegio.

Todo corre en el navegador. Cero backend, cero cuenta. Los datos viven en IndexedDB del dispositivo.

## Stack

- **Next.js 15** (App Router, RSC + Client Components donde hace falta)
- **Dexie 4** sobre IndexedDB (local-first, sin sync todavía)
- **SheetJS (xlsx)** para leer archivos Excel
- **ExcelJS** para generar Califica preservando estilos del template
- **Tailwind CSS** para el estilado

Decisión clave: `Supabase + auth OTP + sync` está *pospuesto a v2* — el mismo camino que Margen. Empezar cliente-only permite validar el flujo entero sin fricción.

## Setup

```bash
npm install
npm run dev
```

Y abres `http://localhost:3000`.

Para probar rápido:

1. Sube `PLANILLA-NOTAS-2026_TRIM_2.xlsx` en la sección "Importar datos".
2. Sube `Califica-451-02.xls` en la misma sección.
3. Entra a cualquier curso (ej. 801).
4. Edita alguna nota, verás la DEF actualizarse en vivo.
5. Click en "Generar Califica del curso 801" → descarga el `.xlsx`.

## Estructura

```
src/
├── app/
│   ├── page.tsx                     # home: importador + lista de cursos
│   ├── curso/[code]/page.tsx        # planilla editable + exportar Califica
│   ├── layout.tsx
│   └── globals.css
├── lib/
│   ├── constants.ts                 # GRADE_META, CURSO_PALABRAS, SLOTS_8_10, SLOTS_11
│   ├── formula.ts                   # calcDef(subnotas, slots, mode) — strict o platform
│   ├── importer.ts                  # importPlanilla + importCodAlumMap
│   ├── exporter.ts                  # exportCalifica (usa templates/Califica-*.xlsx)
│   ├── db.ts                        # Dexie schema
│   └── utils.ts                     # normalizeName, findFuzzyMatch, downloadBlob
├── components/
│   ├── ImportPlanilla.tsx
│   ├── ExportCalifica.tsx
│   ├── CoursesList.tsx
│   └── PlanillaGrid.tsx
├── types/index.ts
public/
└── templates/
    ├── Califica-8-10-template.xlsx  # base para 801-1004
    └── Califica-11-template.xlsx    # base para 1101-1104
```

## Lógica de la fórmula (crítico entenderla)

Hay **dos** cálculos posibles y ambos están implementados en `formula.ts`:

**`strict`** — lo que hace tu Excel Planilla. Los 0 cuentan como notas reales. Ejemplo: si K = C4:60% + C5:40% con C4=100 y C5=0, la Def de K es 60. Con esta cuenta, mientras no hayas calificado un ciclo la DEF de todos se hunde. Es engañoso.

**`platform`** — lo que hace la plataforma del colegio. Los 0 se ignoran (no calificado). El mismo ejemplo da K = 100. Este es el algoritmo confirmado 100% contra la imagen del panel de 801 (curso 801, jul-2026, 27/27 matches exactos):

1. Por categoría: promedio ponderado reescalando los pesos entre las subnotas > 0.
2. Definitiva: promedio simple de las categorías con Def > 0.
3. Redondeo: half-up (no banker's).

La UI muestra siempre `platform`, que es lo que ven en el colegio. El `strict` queda disponible por si algún día necesitas comparar.

### Pesos internos por categoría

Cada categoría (K, M, U, C, E) pesa 20% de la DEF final. Los pesos DENTRO de la categoría cambian entre 8°–10° y 11° (por eso hay dos SLOT_MAPs distintos):

| Categoría | 8°–10° | 11° |
|---|---|---|
| KNOWLEDGE | C4:60 + C5:40 | C2:60 + C4:40 |
| METHOD | C6:50 + C8:50 | C3:40 + C6:60 |
| USE | C2:50 + C9:50 | C5:25 + C8:50 + C9:25 |
| COMMUNICATION | C3:25 + C4:25 + C5:50 | C3:25 + C4:25 + C6:50 |
| EV | C7:100 | C7:100 |

## Modelo de datos

Ver `src/types/index.ts`. Cada `Student` guarda:
- Metadata (codAlum, nombre, orden, activeFrom, withdrawnAt)
- `cycles[9]` — para 8°–10° son {F, R, nota, obs}; para 11° incluyen también `S1` y `S2`.
- `subnotas` — diccionario con 10 o 11 claves según el grado (ver SLOTS_8_10 y SLOTS_11).

Los estudiantes retirados NO se borran: `withdrawnAt` los marca. El exportador Califica solo escribe activos.

## Roadmap

### v2 ✅
- [x] Exportador **EFAS** — consolidado + hoja Salón de honor con estudiantes ≥80
- [x] Horario editable con modelo Día 1–5 + Día Fijo
- [x] Motor de días con festivos (Ley Emiliani auto) y días 0 (cancelados)
- [x] Recordatorio F/R por clase — widget "Hoy" con badge por ciclo y banner de pendientes
- [ ] Auth OTP con Supabase — pospuesto (necesita backend)
- [ ] Sync Dexie ↔ Supabase — pospuesto (necesita backend)

### v3 ✅
- [x] To-do con prioridad y estado (con curso opcional y fecha de vencimiento)
- [x] Calendario de entregas y actividades por curso (overlay en calendario + "Próximas entregas" por curso)
- [x] PWA install (manifest + iconos + service worker + botón instalar + persistencia)
- [ ] Push notifications (VAPID) — v3.1 opcional; requiere endpoint público

### v4+
- [ ] Integración Google Classroom (descarga de entregas)
- [ ] Agente IA calificador con criterios configurables por actividad

## Extras entregados fuera del roadmap original

- **Dashboard por curso** — activos, DEF promedio, % aprobación, distribución, promedios por categoría K/M/U/C/E, listas de riesgo/reprobados/salón de honor, top fallas
- **Dashboard global** en home — grid de las 19 tarjetas por curso con alerta destacada de cursos que requieren atención
- **Backup/restore** JSON de toda la base local (portable, versionado)
- **Notas por columna real** (C2..C9) — el docente ingresa la nota una sola vez; se propaga a los slots K/M/U/C/E que la usen
- **Historial de cambios** — log auditable por curso ("editaste C4 de ALONSO 50→77 hace 5m")
- **F/R por sesión S1/S2 para 11°** — el editor y widget diferencian las dos sesiones por ciclo, con confirmaciones separadas
- **Motor de sesiones por ciclo** — 8°/10°: 1 sesión = 1 ciclo. 11°: 2 sesiones = 1 ciclo
- **Resaltado visual de C7 (EV)** — un cambio ahí mueve la DEF ~4 pts (100% de la categoría E)

## Notas heredadas del análisis

- **19 cursos, 539 estudiantes activos** confirmados contra hoja EFAS del año.
- **Trimestre por defecto: 2**. Cambia la constante o la UI cuando arranque T3.
- **La Planilla del docente tiene 3 fórmulas mal en 11°** (Zambrano Guzmán 1101, Zambrano Salazar 1102, Villamil Beltrán 1103). El importador toma bien las subnotas, no la DEF calculada por el Excel; el cálculo en la app siempre pasa por `formula.ts`. Aun así, conviene arreglar el Excel para que sea consistente.
- **Ingresos posteriores al Califica-451** salen con `FALTA_COD_ALUM`. Hoy: Guerrero Montaña Mariana Isabel (903). En v2 se resolverá con un panel de "estudiantes pendientes de código".
