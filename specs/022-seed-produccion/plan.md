# Plan 022 — seed en producción bajo demanda

1. `src/seed/predeploy.ts`: `predeploy(environment, steps)` migra siempre y siembra solo con `RUN_SEED=true`; el módulo ejecutable lo invoca con `runCommand`. Las dos etapas son inyectables para probar el orden sin base de datos.
2. Pruebas: `test/unit/predeploy.spec.ts` (CA-01 y CA-03, sin base de datos) y `test/database/predeploy.e2e-spec.ts` (CA-01 y CA-02 con PostgreSQL real y esquema propio).
3. `.github/workflows/seed.yml`: solo `workflow_dispatch`, environment `production`, mismo grupo de concurrencia que el despliegue; pone `RUN_SEED=true` (sin disparar despliegue), redespliega, espera `GET /health/ready` y siempre deja `RUN_SEED=false`.
4. Documentación: D-124, README (sección Despliegue y fila 22), `docs/commits/022.md`.
5. Verificación: `format:check`, `lint`, `typecheck`, `build` y `test:cov`.
6. Manual, en Railway: cambiar el pre-deploy del servicio `api` a `node dist/seed/predeploy.js`.

## Orden de la primera ejecución real

Primero el deploy normal con el pre-deploy nuevo (sin bandera: solo migra), luego «Run workflow» del seed. Se comprueba en los logs de despliegue de Railway la línea «RUN_SEED=true: se ejecuta el seed.» y «Seed completado».
