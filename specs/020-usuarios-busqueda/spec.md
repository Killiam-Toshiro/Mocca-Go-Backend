# Spec 020 — Usuarios: búsqueda, filtro por rol y edición de clientes

Fecha: 2026-11-11. Estado: **borrador para tu aprobación** (no hay código). Rama prevista: `feature-usuarios-busqueda`. Origen: lista de cambios del chat del frontend (spec 007a del front) contrastada con el código del back.

## 1. Objetivo

Que el frontend administre usuarios con la búsqueda y el filtro hechos en el servidor (hoy descarga todos los usuarios y filtra en el navegador), que el admin pueda corregir el nombre y el teléfono de un cliente, y cerrar tres huecos de seguridad del módulo de usuarios. La API sigue en 53 operaciones (cambian parámetros y reglas, no hay rutas nuevas).

## 2. Decisiones ya tomadas (tuyas, 2026-11-11)

| ID    | Decisión                                                                                                                  |
| ----- | ------------------------------------------------------------------------------------------------------------------------- |
| DP-01 | El admin edita de un cliente **solo nombre y teléfono**; el correo no se edita (es su identidad de acceso).               |
| DP-02 | **No** se implementa «desactivar»: solo se borra. El personal con historial queda sin baja hasta un incremento posterior. |
| DP-03 | Al cambiar el rol de un usuario se **revocan todas sus sesiones** (vuelve al login y sus canales en vivo se cierran).     |
| DP-04 | **Sin extensiones** (`unaccent`, `pg_trgm`): `ILIKE` con escape; no distingue mayúsculas pero sí tildes. Sin migración.   |

## 3. Lo que encontré al contrastar con el código (hechos)

1. `GET /users` solo acepta `page` y `limit` (`findAndCount`); no filtra ni busca.
2. `PATCH /users/:id` responde `400` («Los datos de contacto de un cliente los edita él mismo») si el usuario es cliente y llegan `phone` o `fullName`.
3. **El admin hoy SÍ puede restablecer la contraseña de un cliente** con `PATCH /users/:id { password }` (prueba CA-45 de `customers.e2e-spec.ts`). Como no existe «olvidé mi contraseña», es la única vía de recuperación. La lista del front asumía lo contrario; **no la cierro** (ver §7).
4. Borrar un usuario con historial ya responde `409` también para pedidos, eventos de pedido, rondas y encuestas (por las claves foráneas), pero con el texto «El usuario tiene movimientos…». Hay prueba para movimientos y encuestas, no para pedidos ni rondas.
5. Ya se rechaza borrarse a sí mismo y borrar o degradar al último admin (con pruebas). **No** se rechaza que un admin cambie **su propio rol** si hay otro admin.
6. El rol se lee de la base en cada petición (aplica en la siguiente), pero `changeRole` no revoca sesiones y los canales en vivo solo comprueban que la sesión siga vigente, no el rol: un operador degradado conservaría la cocina en vivo hasta reconectar.

## 4. Alcance

**Entra**

- **A1** `GET /users` con `search` y `role`.
- **A2** Edición de nombre y teléfono de un cliente por el admin.
- **B1** Un admin no cambia su propio rol (`409`).
- **B2** Texto genérico del `409` al borrar con historial y pruebas por cada tipo de historial.
- **B3** Cambio de rol revoca las sesiones del usuario.
- Mover `escapeLike` a `src/common/`.

**No entra**

- Desactivar usuarios (DP-02). `mustChangePassword` (recomiendo dejarlo para el incremento de desactivación o de seguridad del personal; no se implementa aquí).
- Búsqueda sin tildes ni índices trigram (DP-04).
- Editar el correo de un cliente (DP-01).

## 5. Contrato

### 5.1 `GET /users` (solo admin)

| Parámetro | Regla                                                                                                                                                                                                                       |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search`  | Texto con `trim`; si queda vacío se ignora; máximo 100 caracteres; sin NUL. Busca (OR, `ILIKE '%…%'` con `%`, `_` y `\` escapados) en `username`, nombre y teléfono del usuario y en correo, nombre y teléfono del cliente. |
| `role`    | Uno o varios valores separados por coma de `admin`, `operador`, `repartidor`, `cliente` (sin repetidos; cada uno se valida). Valor inválido → `400`. Ejemplo «Personal»: `role=admin,operador,repartidor`.                  |
| Teléfono  | Si `search` trae 3 o más dígitos, también se compara contra los dígitos del teléfono guardado (`300 123` encuentra `+57300123…`).                                                                                           |

Sin parámetros la respuesta es **idéntica a la de hoy** (retrocompatible). Orden: `username ASC, id ASC`. `total` y `totalPages` se calculan con los mismos filtros. Forma: `{ data, page, limit, total, totalPages }`.

### 5.2 `PATCH /users/{id}` sobre un cliente

- `phone` y `fullName` se escriben en la ficha del cliente (`customers`), en una transacción, con las reglas del cliente: nombre 2–100 con `trim`, teléfono E.164 normalizado. Solo se escribe lo que cambia (repetir el valor no modifica `updatedAt`).
- Sobre personal: sin cambios (nombre 2–80).
- `UpdateUserDto` admite `fullName` hasta 100; el servicio exige 80 para personal con un `400` claro.
- `email` no se acepta (el campo no existe en el DTO: `400` por propiedad no permitida, como hoy).
- `password` sobre un cliente sigue permitido (restablecer; revoca sus otras sesiones). `username` sobre un cliente: ver §7.

### 5.3 `PATCH /users/{id}/role`

- Si el actor es el mismo usuario → `409` «No puedes cambiar tu propio rol.» (se evalúa después de «último administrador», igual que en `DELETE`).
- Al cambiar el rol de otro usuario se revocan **todas** sus sesiones activas (incluye canales en vivo, que se cierran en el siguiente latido, máximo 25 s). Repetir el mismo rol no cambia nada ni revoca.

### 5.4 `DELETE /users/{id}`

El `409` por historial pasa a decir «El usuario tiene historial asociado; no se puede eliminar.» para movimientos, pedidos, eventos de pedido, rondas y encuestas.

## 6. Criterios de aceptación

| ID    | Criterio                                                                                                                                                                                             |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CA-01 | Sin `search` ni `role`, `GET /users` devuelve lo mismo que hoy (datos, orden, `total`, `totalPages`).                                                                                                |
| CA-02 | `search` encuentra por `username`, nombre y teléfono del personal y por correo, nombre y teléfono de un cliente; ignora mayúsculas; `%` y `_` se buscan como texto literal.                          |
| CA-03 | `search` con 3 o más dígitos encuentra por el teléfono sin importar espacios o el `+57`; con menos de 3 dígitos solo busca como texto.                                                               |
| CA-04 | `search` vacío o de espacios se ignora; de más de 100 caracteres o con NUL → `400`.                                                                                                                  |
| CA-05 | `role` simple y múltiple (`admin,operador,repartidor`) filtra correctamente; un valor inválido o vacío entre comas → `400`; repetidos se aceptan una vez.                                            |
| CA-06 | `search` y `role` combinados, con `page`/`limit`, dan `total` y `totalPages` coherentes con el filtro y el orden se mantiene.                                                                        |
| CA-07 | El admin cambia nombre y teléfono de un cliente: `200`, `GET /customers/me` del cliente los muestra, `updatedAt` cambia solo si hubo cambio, y nombre de 101 caracteres o teléfono inválido → `400`. |
| CA-08 | El nombre de un miembro del personal de 81 a 100 caracteres → `400` claro; hasta 80, `200` (sin regresión de `staff-contact`).                                                                       |
| CA-09 | La edición de contacto de un cliente es atómica: si falla la validación o la escritura, no cambia nada.                                                                                              |
| CA-10 | Un admin no cambia su propio rol (`409`), también con otro admin registrado; el único admin sigue respondiendo la regla de «último administrador».                                                   |
| CA-11 | Cambiar el rol de otro usuario revoca sus sesiones: su JWT responde `401` y un canal SSE abierto se cierra en el siguiente latido; repetir el mismo rol no revoca.                                   |
| CA-12 | Borrar con historial responde `409` con el texto genérico para cada tipo: movimientos, pedido, ronda (repartidor) y encuesta; nada se borra.                                                         |
| CA-13 | Swagger documenta `search` y `role` (con ejemplos) y mantiene 53 operaciones; las pruebas de contrato se actualizan.                                                                                 |
| CA-14 | `format:check`, `lint`, `typecheck`, `build` y `test:cov` pasan; Postman (carpeta nueva) y README actualizados; `docs/openapi.json` regenerado para el frontend.                                     |

## 7. Puntos por confirmar

1. **`username` de un cliente.** Es un valor interno derivado de su id y el cliente entra con su correo. Propongo que el admin **no lo cambie** (`400` claro) y que **sí** pueda seguir restableciendo su contraseña (§3, hecho 3). Si prefieres cerrar también la contraseña, hay que decidir antes cómo recupera su acceso un cliente.
2. **`mustChangePassword`** (primer ingreso del personal): lo dejo fuera; es una decisión de seguridad para otro incremento.
3. El front debe ajustar su spec 007a: la búsqueda y el filtro pasan al servidor (cae el tope de 5000), y el cambio de rol cierra las sesiones del usuario (ya no «aplica en la siguiente petición»).

## 8. Siguiente paso

Tu aprobación de esta spec y de §7 → `plan.md` y `tasks.md` → migración (ninguna) y código → pruebas → `docs/commits/020.md`, con parada para tu revisión. Sin commit hasta que lo pidas.
