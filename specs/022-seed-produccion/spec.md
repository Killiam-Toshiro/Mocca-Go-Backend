# Spec 022 — Seed en producción bajo demanda

Fecha: 2026-11-26. Estado: **aprobada** (2026-11-26).

## Problema

El seed (usuarios de personal, menú, zonas y puntos) debe correr una vez en la base de producción de Railway, y hoy solo se ejecuta a mano desde un equipo con la CLI. Un workflow de GitHub no puede ejecutarlo directamente:

- `railway ssh` exige una llave SSH registrada en una cuenta; un project token (`RAILWAY_TOKEN`) no basta.
- `railway run` ejecuta el comando en el runner de GitHub, que no alcanza la red privada de Railway (`DB_HOST` interno).
- El proxy público de Postgres obligaría a debilitar la verificación TLS (`rejectUnauthorized: true`), lo que se descarta.

## Diseño

El seed corre **dentro del contenedor de Railway**, durante el pre-deploy y tras las migraciones, solo cuando una bandera lo pide:

1. Nuevo comando `node dist/seed/predeploy.js`: ejecuta las migraciones y, solo si `RUN_SEED` vale exactamente `true`, ejecuta después el seed existente. Con cualquier otro valor o sin la variable, solo migra.
2. El pre-deploy del servicio `api` pasa de `node dist/database/migrate.js run` a `node dist/seed/predeploy.js`.
3. Nuevo workflow manual `.github/workflows/seed.yml` (`workflow_dispatch`, environment `production`, sin disparo automático):
   1. pone `RUN_SEED=true` en el servicio `api` con el project token;
   2. redespliega la versión vigente (`railway redeploy`), que corre migraciones y seed;
   3. espera el resultado y consulta `GET /api/v1/health/ready`;
   4. **siempre**, aunque falle, apaga `RUN_SEED` (la deja en `false`) para que ningún deploy posterior vuelva a sembrar.

## Reglas

| ID    | Regla                                                                                                                               |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------- |
| RN-01 | Sin `RUN_SEED=true` el pre-deploy solo migra: el comportamiento actual no cambia.                                                   |
| RN-02 | El seed sigue siendo idempotente (no cambia contraseñas, roles ni lo que el admin editó) y transaccional; no se modifica su lógica. |
| RN-03 | Las contraseñas de seed siguen viniendo de `SEED_*_PASSWORD` en Railway; el workflow no las lee ni las imprime.                     |
| RN-04 | El workflow nunca corre solo (ni push ni pull request), y los logs no muestran secretos.                                            |
| RN-05 | Si falla la migración, el seed no se ejecuta; si falla el seed, el deploy falla y la bandera se quita igualmente.                   |

## Criterios de aceptación

| ID    | Criterio                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------ |
| CA-01 | Con `RUN_SEED` ausente o distinta de `true`, `predeploy` migra y no siembra (prueba con PostgreSQL).   |
| CA-02 | Con `RUN_SEED=true`, `predeploy` migra y siembra; repetirlo no duplica ni pisa datos.                  |
| CA-03 | Si la migración falla, no se llama al seed.                                                            |
| CA-04 | `seed.yml` solo tiene `workflow_dispatch`, usa el environment `production` y quita la bandera siempre. |
| CA-05 | `format:check`, `lint`, `typecheck`, `build` y `test:cov` siguen en verde.                             |

## Riesgo abierto

No pude verificar sin una cuenta de Railway que el project token permita cambiar variables y redesplegar con `railway variables` y `railway redeploy`. Se comprueba en la primera ejecución real. Si no fuera posible, el respaldo es poner y quitar `RUN_SEED` a mano en el panel de Railway; el código del pre-deploy sirve igual.

## Fuera de alcance

Endpoint HTTP de seed, seed en cada deploy, cambios en la lógica del seed y el despliegue del front.
