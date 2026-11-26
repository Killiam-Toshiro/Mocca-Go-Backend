import { CatalogHarness, ErrorBody } from '../helpers/catalog-app';
import {
  Customer,
  Fixture,
  fixture,
  forceOrder,
  OrderBody,
  placeOrder,
  validBody,
} from '../helpers/orders-app';

describe('Eliminar zonas y puntos con historial responde 409 (RN-44)', () => {
  const harness = new CatalogHarness();
  let ana: Customer;
  let f: Fixture;
  beforeEach(async () => {
    await harness.start();
    ana = await harness.customer('ana');
    f = await fixture(harness);
  });
  afterEach(() => harness.stop());

  const message = (response: { body: unknown }) =>
    (response.body as ErrorBody).message;
  const order = async (status = 'recibido') => {
    const placed = (await placeOrder(harness, ana, validBody(f)).expect(201))
      .body as OrderBody;
    if (status !== 'recibido')
      await forceOrder(harness, placed.id, ana, {
        status,
        events: { recibido: new Date() },
      });
    return placed;
  };
  const existing = async (
    table: 'delivery_points' | 'delivery_zones',
    id: string,
  ) =>
    (
      await harness.context.source.query<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM "${harness.context.ownedSchema}"."${table}" WHERE id = $1`,
        [id],
      )
    )[0].n;

  it('un punto que ya usó un pedido da 409, sigue existiendo y se puede desactivar', async () => {
    await order();
    const refused = await harness
      .send('delete', `/delivery-points/${f.point.id}`)
      .expect(409);
    expect(message(refused)).toBe(
      'El punto tiene pedidos; desactívalo en vez de eliminarlo.',
    );
    expect(await existing('delivery_points', f.point.id)).toBe(1);
    await harness
      .send('patch', `/delivery-points/${f.point.id}`, { active: false })
      .expect(200);
  });

  it('un punto sin pedidos se sigue eliminando (204) y el inexistente da 404', async () => {
    await order();
    await harness.send('delete', `/delivery-points/${f.flat.id}`).expect(204);
    expect(await existing('delivery_points', f.flat.id)).toBe(0);
    await harness.send('delete', `/delivery-points/${f.flat.id}`).expect(404);
  });

  it('una zona con puntos conserva su 409 de siempre', async () => {
    const refused = await harness
      .send('delete', `/delivery-zones/${f.point.zoneId}`)
      .expect(409);
    expect(message(refused)).toContain('La zona tiene puntos');
  });

  it('una zona con rondas, aunque ya no tenga puntos, da 409 y se puede desactivar', async () => {
    await order('en_camino');
    // El punto se muda a la otra zona: la zona original queda vacía pero con rondas.
    await harness
      .send('patch', `/delivery-points/${f.point.id}`, {
        zoneId: f.flat.zoneId,
      })
      .expect(200);
    const refused = await harness
      .send('delete', `/delivery-zones/${f.point.zoneId}`)
      .expect(409);
    expect(message(refused)).toBe(
      'La zona tiene rondas de despacho; desactívala en vez de eliminarla.',
    );
    expect(await existing('delivery_zones', f.point.zoneId)).toBe(1);
    await harness
      .send('patch', `/delivery-zones/${f.point.zoneId}`, { active: false })
      .expect(200);
  });

  it('una zona vacía y sin rondas se elimina (204)', async () => {
    await harness
      .send('patch', `/delivery-points/${f.flat.id}`, {
        zoneId: f.point.zoneId,
      })
      .expect(200);
    await harness
      .send('delete', `/delivery-zones/${f.flat.zoneId}`)
      .expect(204);
  });
});
