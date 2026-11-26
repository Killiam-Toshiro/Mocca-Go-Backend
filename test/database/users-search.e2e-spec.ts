import { randomUUID } from 'node:crypto';
import { CatalogHarness, ErrorBody } from '../helpers/catalog-app';
import {
  Fixture,
  fixture,
  forceOrder,
  OrderBody,
  placeOrder,
  validBody,
} from '../helpers/orders-app';
import { Customer } from '../../src/customers/entities/customer.entity';
import { User, UserRole } from '../../src/users/entities/user.entity';

interface Row {
  id: string;
  username: string;
  role: string;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  updatedAt: string;
}
interface Page {
  data: Row[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

describe('Usuarios: búsqueda, rol y edición de clientes (CA-01 a CA-13)', () => {
  const harness = new CatalogHarness();
  let ana: string;
  let roberto: string;
  beforeEach(async () => {
    await harness.start();
    const users = harness.context.source.getRepository(User);
    const customers = harness.context.source.getRepository(Customer);
    await users.save({
      username: 'op_lucia',
      role: 'operador',
      passwordHash: 'x',
      phone: '+573201112222',
      fullName: 'Lucía Operadora',
    });
    const mk = async (
      username: string,
      email: string,
      fullName: string,
      phone: string,
    ) => {
      const user = await users.save({
        username,
        role: 'cliente',
        passwordHash: 'x',
      });
      await customers.save({ userId: user.id, email, fullName, phone });
      return user.id;
    };
    ana = await mk(
      'c_ana',
      'ana.perez@u.icesi.edu.co',
      'Ana Pérez',
      '+573001234567',
    );
    roberto = await mk(
      'c_roberto',
      'roberto@u.icesi.edu.co',
      'Roberto 100% Gómez',
      '+573115556677',
    );
  });
  afterEach(() => harness.stop());

  const list = (query = '', role: UserRole = 'admin') =>
    harness.get(`/users${query}`, role);
  const names = async (query: string) =>
    ((await list(query).expect(200)).body as Page).data.map((r) => r.username);
  const message = (response: { body: unknown }) =>
    (response.body as ErrorBody).message;
  const idOf = async (username: string) =>
    (
      await harness.context.source.query<{ id: string }[]>(
        `SELECT id FROM "${harness.context.ownedSchema}"."users" WHERE username = $1`,
        [username],
      )
    )[0].id;

  describe('GET /users', () => {
    it('CA-01: sin parámetros devuelve todos, por username, como antes', async () => {
      const body = (await list().expect(200)).body as Page;
      expect(body.data.map((r) => r.username)).toEqual([
        'c_ana',
        'c_roberto',
        'op_lucia',
        'rol_admin',
        'rol_cliente',
        'rol_operador',
        'rol_repartidor',
      ]);
      expect(body).toMatchObject({
        page: 1,
        limit: 20,
        total: 7,
        totalPages: 1,
      });
      expect(body.data[0]).toMatchObject({
        email: 'ana.perez@u.icesi.edu.co',
        fullName: 'Ana Pérez',
        phone: '+573001234567',
      });
    });

    it('CA-02: search por usuario, nombre, teléfono y correo, sin distinguir mayúsculas', async () => {
      expect(await names('?search=LUCIA')).toEqual(['op_lucia']);
      expect(await names('?search=Lucia%20O')).toEqual([]); // distingue tildes
      expect(await names('?search=Lucía')).toEqual(['op_lucia']);
      expect(await names('?search=op_')).toEqual(['op_lucia']);
      expect(await names('?search=pérez')).toEqual(['c_ana']);
      expect(await names('?search=ICESI')).toEqual(['c_ana', 'c_roberto']);
      expect(await names('?search=roberto@')).toEqual(['c_roberto']);
      expect(await names('?search=carlos')).toEqual(['rol_repartidor']);
    });

    it('CA-02: % y _ se buscan como texto literal', async () => {
      expect(await names('?search=100%25')).toEqual(['c_roberto']);
      expect(await names('?search=%25')).toEqual(['c_roberto']);
      expect(await names('?search=op_l')).toEqual(['op_lucia']);
      expect(await names('?search=op%25l')).toEqual([]);
      expect(await names('?search=_')).toEqual(
        expect.arrayContaining(['c_ana', 'c_roberto', 'op_lucia']),
      );
      expect(await names('?search=c%5Cana')).toEqual([]);
    });

    it('CA-03: con 3 o más dígitos busca por los dígitos del teléfono', async () => {
      expect(await names('?search=300%20123')).toEqual([
        'c_ana',
        'rol_repartidor',
      ]);
      expect(await names('?search=%2B57%20320')).toEqual(['op_lucia']);
      expect(await names('?search=311-555')).toEqual(['c_roberto']);
      expect(await names('?search=3001234567')).toEqual(['c_ana']);
      expect(await names('?search=3%200')).toEqual([]); // 2 dígitos: solo texto
    });

    it('CA-04: search vacío se ignora; muy largo o con NUL es 400', async () => {
      expect(await names('?search=')).toHaveLength(7);
      expect(await names('?search=%20%20')).toHaveLength(7);
      await list(`?search=${'a'.repeat(101)}`).expect(400);
      await list('?search=a%00b').expect(400);
      expect(await names(`?search=${'a'.repeat(100)}`)).toEqual([]);
    });

    it('CA-05: role simple, múltiple, repetido e inválido', async () => {
      expect(await names('?role=cliente')).toEqual([
        'c_ana',
        'c_roberto',
        'rol_cliente',
      ]);
      expect(await names('?role=admin,operador,repartidor')).toEqual([
        'op_lucia',
        'rol_admin',
        'rol_operador',
        'rol_repartidor',
      ]);
      expect(await names('?role=operador,operador')).toEqual([
        'op_lucia',
        'rol_operador',
      ]);
      for (const query of [
        '?role=root',
        '?role=',
        '?role=admin,',
        '?role=admin,x',
      ])
        await list(query).expect(400);
    });

    it('CA-06: combinados con paginación, total y totalPages siguen al filtro', async () => {
      const page = (
        await list('?role=cliente,operador&search=ro&limit=2&page=2').expect(
          200,
        )
      ).body as Page;
      // coinciden con «ro»: c_roberto, rol_cliente y rol_operador
      expect(page).toMatchObject({
        page: 2,
        limit: 2,
        total: 3,
        totalPages: 2,
      });
      expect(page.data.map((r) => r.username)).toEqual(['rol_operador']);
      const first = (
        await list('?role=cliente,operador&search=ro&limit=2').expect(200)
      ).body as Page;
      expect(first.data.map((r) => r.username)).toEqual([
        'c_roberto',
        'rol_cliente',
      ]);
    });

    it('sigue siendo solo del admin', async () => {
      for (const role of ['operador', 'repartidor'] as const)
        await list('?search=a', role).expect(403);
      await harness.get('/users?search=a').expect(401);
    });
  });

  describe('PATCH /users/:id sobre un cliente', () => {
    const patch = (id: string, body: object) =>
      harness.send('patch', `/users/${id}`, body);

    it('CA-07: el admin cambia nombre y teléfono; el cliente lo ve en su perfil', async () => {
      const before = (await patch(ana, { fullName: 'Ana P.' }).expect(200))
        .body as Row;
      expect(before).toMatchObject({
        fullName: 'Ana P.',
        phone: '+573001234567',
        email: 'ana.perez@u.icesi.edu.co',
        role: 'cliente',
      });
      const response = await patch(ana, {
        fullName: '  Ana Pérez Gómez  ',
        phone: '311 222 3344',
      }).expect(200);
      expect(response.body).toMatchObject({
        fullName: 'Ana Pérez Gómez',
        phone: '+573112223344',
      });
      const profile = await harness
        .get('/customers/me')
        .set('Authorization', `Bearer ${await harness.tokenFor(ana)}`)
        .expect(200);
      expect(profile.body).toMatchObject({
        fullName: 'Ana Pérez Gómez',
        phone: '+573112223344',
      });
    });

    it('CA-07: repetir los valores no modifica updatedAt', async () => {
      const first = (
        await patch(ana, {
          fullName: 'Ana Nueva',
          phone: '+573001234567',
        }).expect(200)
      ).body as Row;
      const again = (
        await patch(ana, {
          fullName: 'Ana Nueva',
          phone: '300 123 4567',
        }).expect(200)
      ).body as Row;
      expect(again.updatedAt).toBe(first.updatedAt);
      const stored = await harness.context.source.query<{ updated_at: Date }[]>(
        `SELECT updated_at FROM "${harness.context.ownedSchema}"."customers" WHERE user_id = $1`,
        [ana],
      );
      expect(new Date(again.updatedAt).getTime()).toBeLessThanOrEqual(
        stored[0].updated_at.getTime() + 1000,
      );
    });

    it('CA-07: nombre de 101 caracteres, de 1 o teléfono inválido es 400 y no cambia nada', async () => {
      for (const body of [
        { fullName: 'x'.repeat(101) },
        { fullName: 'A' },
        { fullName: '   ' },
        { phone: 'abc' },
        { phone: '12' },
        { fullName: 'Nombre Bueno', phone: 'abc' },
      ])
        await patch(ana, body).expect(400);
      const stored = (await list('?search=c_ana').expect(200)).body as Page;
      expect(stored.data[0]).toMatchObject({
        fullName: 'Ana Pérez',
        phone: '+573001234567',
      });
    });

    it('CA-07: el username de un cliente es interno (400) y el correo no se acepta', async () => {
      const username = await patch(ana, { username: 'otro_nombre' }).expect(
        400,
      );
      expect(message(username)).toContain('interno');
      await patch(ana, { email: 'nuevo@u.icesi.edu.co' }).expect(400);
      expect(await names('?role=cliente')).toEqual([
        'c_ana',
        'c_roberto',
        'rol_cliente',
      ]);
    });

    it('la contraseña de un cliente se sigue pudiendo restablecer', async () => {
      await patch(ana, { password: 'clave-nueva-del-admin-1' }).expect(200);
    });

    it('CA-08: el personal admite hasta 80 caracteres de nombre', async () => {
      const id = await idOf('op_lucia');
      const refused = await patch(id, { fullName: 'x'.repeat(81) }).expect(400);
      expect(message(refused)).toContain('80');
      await patch(id, { fullName: 'x'.repeat(80) }).expect(200);
      await patch(id, { fullName: 'x'.repeat(101) }).expect(400);
    });

    it('CA-09: si una escritura falla no cambia ninguno de los campos', async () => {
      await harness.context.source.query(
        `ALTER TABLE "${harness.context.ownedSchema}"."customers"
           ADD CONSTRAINT test_no_marcador CHECK (full_name <> 'Marcador Prohibido')`,
      );
      await patch(ana, {
        phone: '311 222 3344',
        fullName: 'Marcador Prohibido',
      }).expect(500);
      const stored = (await list('?search=c_ana').expect(200)).body as Page;
      expect(stored.data[0]).toMatchObject({
        fullName: 'Ana Pérez',
        phone: '+573001234567',
      });
    });

    it('CA-07: un cliente inexistente es 404', async () => {
      await patch(randomUUID(), { fullName: 'Fantasma' }).expect(404);
      expect(roberto).toBeDefined();
    });
  });

  describe('PATCH /users/:id/role', () => {
    const changeRole = (id: string, role: string) =>
      harness.send('patch', `/users/${id}/role`, { role });

    it('CA-10: un admin no cambia su propio rol, ni con otro admin registrado', async () => {
      const adminId = await idOf('rol_admin');
      const only = await changeRole(adminId, 'operador').expect(409);
      expect(message(only)).toContain('último administrador');
      await harness.context.source
        .getRepository(User)
        .save({ username: 'admin_dos', role: 'admin', passwordHash: 'x' });
      const own = await changeRole(adminId, 'operador').expect(409);
      expect(message(own)).toBe('No puedes cambiar tu propio rol.');
      await harness.get('/users', 'admin').expect(200);
    });

    it('CA-11: cambiar el rol de otro revoca sus sesiones; repetir el rol no', async () => {
      const id = await idOf('op_lucia');
      const header = `Bearer ${await harness.tokenFor(id)}`;
      await harness
        .get('/kitchen/orders')
        .set('Authorization', header)
        .expect(200);
      await changeRole(id, 'operador').expect(200);
      await harness
        .get('/kitchen/orders')
        .set('Authorization', header)
        .expect(200);
      await changeRole(id, 'repartidor').expect(200);
      await harness
        .get('/kitchen/orders')
        .set('Authorization', header)
        .expect(401);
      const sessions = await harness.context.source.query<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM "${harness.context.ownedSchema}"."sessions"
          WHERE user_id = $1 AND revoked_at IS NULL`,
        [id],
      );
      expect(sessions[0].n).toBe(0);
    });
  });

  describe('DELETE /users/:id con historial', () => {
    let f: Fixture;
    const GENERIC =
      'El usuario tiene historial asociado; no se puede eliminar.';
    beforeEach(async () => {
      f = await fixture(harness);
    });
    const remove = (id: string) => harness.send('delete', `/users/${id}`);

    it('CA-12: pedidos', async () => {
      const buyer = await harness.customer('compradora');
      const placed = (
        await placeOrder(harness, buyer, validBody(f)).expect(201)
      ).body as OrderBody;
      expect(placed.id).toBeDefined();
      expect(message(await remove(buyer.id).expect(409))).toBe(GENERIC);
      expect(await names('?search=cli_compradora')).toEqual(['cli_compradora']);
    });

    it('CA-12: rondas (y el pedido que repartió)', async () => {
      const buyer = await harness.customer('compradora');
      const placed = (
        await placeOrder(harness, buyer, validBody(f)).expect(201)
      ).body as OrderBody;
      await forceOrder(harness, placed.id, buyer, {
        status: 'en_camino',
        events: { recibido: new Date() },
      });
      const courier = await idOf('rol_repartidor');
      expect(message(await remove(courier).expect(409))).toBe(GENERIC);
    });

    it('CA-12: encuestas', async () => {
      const buyer = await harness.customer('compradora');
      const placed = (
        await placeOrder(harness, buyer, validBody(f)).expect(201)
      ).body as OrderBody;
      await forceOrder(harness, placed.id, buyer, {
        status: 'entregado',
        events: { recibido: new Date() },
      });
      await harness
        .send('post', `/orders/${placed.id}/survey`, { rating: 5 }, 'cliente')
        .set('Authorization', buyer.auth)
        .expect(201);
      expect(message(await remove(buyer.id).expect(409))).toBe(GENERIC);
    });

    it('CA-12: movimientos de inventario', async () => {
      const operator = await idOf('rol_operador');
      await harness
        .send(
          'post',
          '/movements',
          {
            productId: f.capu.id,
            type: 'IN',
            quantity: 1,
            reason: 'Ingreso de prueba',
          },
          'operador',
        )
        .expect(201);
      expect(message(await remove(operator).expect(409))).toBe(GENERIC);
    });
  });
});
