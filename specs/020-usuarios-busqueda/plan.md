# Plan 020 — Usuarios: búsqueda, filtro por rol y edición de clientes

Fecha: 2026-11-11. Spec aprobada el mismo día. Sin migración: todo es lógica de servicio y DTO.

## Enfoque

1. **`src/common/like.ts`**: `escapeLike` se mueve desde `products.services.ts`; productos y usuarios lo importan.
2. **`ListUsersDto`**: `search` (recortado, ≤100, sin NUL) y `role` (texto con comas → arreglo sin repetidos, validado con `IsIn` por elemento).
3. **`UsersService.list`**: `QueryBuilder` con `LEFT JOIN customers` solo para filtrar; las filas de cliente se siguen cargando como antes. Búsqueda `ILIKE … ESCAPE '\'` en seis columnas y, con 3 o más dígitos, comparación contra `regexp_replace(phone, '\D', '', 'g')`. Mismo orden y mismos `total`/`totalPages`.
4. **`UsersService.update`** sobre un cliente: `phone` y `fullName` van a `customers` dentro de la misma transacción (con el usuario bloqueado); `username` se rechaza (`400`); personal conserva el tope de 80 caracteres, verificado en el servicio porque el DTO ahora admite 100.
5. **`UsersService.changeRole`**: rechaza el cambio del propio rol (`409`, después de «último administrador») y revoca todas las sesiones del usuario editado.
6. **`UsersService.remove`**: texto genérico «historial asociado».
7. Swagger, arnés de pruebas (`tokenFor` público), colecciones Postman (07j), README y `docs/openapi.json`.

## Piezas

| Archivo                                  | Cambio                                                                             |
| ---------------------------------------- | ---------------------------------------------------------------------------------- |
| `src/common/like.ts`                     | `escapeLike` compartido.                                                           |
| `src/users/users.dto.ts`                 | `search`, `role`; `fullName` hasta 100 en `UpdateUserDto`.                         |
| `src/users/users.service.ts`             | Listado filtrado, edición de clientes, rol propio, revocación, texto de historial. |
| `src/users/users.controller.ts`          | Textos de Swagger.                                                                 |
| `test/database/users-search.e2e-spec.ts` | CA-01 a CA-12.                                                                     |

## Decisiones técnicas

- **Sin cambios en la respuesta**: el formato de `UserView` no cambia.
- **Cambio de rol = sesión nueva**: los canales en vivo se cierran solos con el latido (≤25 s) porque comprueban la sesión.
- **Sin extensiones**: `ILIKE` distingue tildes; `unaccent` y `pg_trgm` quedan para cuando se confirme el soporte en producción.
