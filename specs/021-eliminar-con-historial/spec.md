# Spec 021 — Eliminar zonas y puntos con historial responde 409

Fecha: 2026-11-12. Corrección de un defecto pedido por el equipo del frontend; el alcance es el detallado en su solicitud, que se toma como aprobado.

## Problema

- `DELETE /delivery-points/{id}` respondía `500` si algún pedido usó el punto (`orders_point_id_fkey`, `ON DELETE RESTRICT`).
- `DELETE /delivery-zones/{id}` respondía `500` si alguna ronda de despacho usó la zona (`dispatch_rounds_zone_id_fkey`), incluso sin puntos (por ejemplo, si sus puntos se movieron a otra zona).
- Solo se traducía la violación de `delivery_points_zone_id_fkey` (zona con puntos). RN-44 de la spec 015 ya prometía el `409`.

## Contrato

| Operación                      | Caso                      | Respuesta                                                                   |
| ------------------------------ | ------------------------- | --------------------------------------------------------------------------- |
| `DELETE /delivery-points/{id}` | Algún pedido usó el punto | `409` «El punto tiene pedidos; desactívalo en vez de eliminarlo.»           |
| `DELETE /delivery-points/{id}` | Sin pedidos / inexistente | `204` / `404` «Punto no encontrado.» (sin cambios)                          |
| `DELETE /delivery-zones/{id}`  | La zona tiene puntos      | `409` «La zona tiene puntos; muévelos o elimínalos antes.» (sin cambios)    |
| `DELETE /delivery-zones/{id}`  | Alguna ronda usó la zona  | `409` «La zona tiene rondas de despacho; desactívala en vez de eliminarla.» |

Cualquier otro error se relanza igual. La acción alternativa es desactivar con `PATCH` (`active: false`).

## Criterios de aceptación

| ID    | Criterio                                                                                                          |
| ----- | ----------------------------------------------------------------------------------------------------------------- |
| CA-01 | Eliminar un punto con un pedido da `409` con el texto exacto y el punto sigue existiendo; se puede desactivar.    |
| CA-02 | Eliminar un punto sin pedidos da `204`; el inexistente, `404`.                                                    |
| CA-03 | Eliminar una zona con rondas y sin puntos da `409` con el texto exacto y la zona sigue existiendo.                |
| CA-04 | Eliminar una zona con puntos conserva su `409`; una zona vacía y sin rondas da `204`.                             |
| CA-05 | Swagger documenta los `409` de ambas rutas; `docs/openapi.json` regenerado; `test:cov` y demás comprobaciones OK. |
