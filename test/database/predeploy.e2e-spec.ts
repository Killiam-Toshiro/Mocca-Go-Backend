import { User } from '../../src/users/entities/user.entity';
import { Product } from '../../src/products/entities/products.entity';
import { predeploy } from '../../src/seed/predeploy';
import {
  createTestDatabase,
  disposeTestDatabase,
  inTestEnvironment,
  TestDatabase,
} from '../helpers/database';

describe('predeploy con PostgreSQL', () => {
  let context: TestDatabase;
  let log: jest.SpyInstance;

  beforeAll(async () => {
    context = await createTestDatabase();
  });

  beforeEach(() => {
    log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => log.mockRestore());

  afterAll(async () => {
    if (context) await disposeTestDatabase(context);
  });

  it('sin la bandera migra y no siembra', async () => {
    await inTestEnvironment(context, () => predeploy({}));
    expect(await context.source.getRepository(User).count()).toBe(0);
    expect(await context.source.getRepository(Product).count()).toBe(0);
  });

  it('con RUN_SEED=true siembra, y repetirlo no duplica ni pisa datos', async () => {
    await inTestEnvironment(context, () => predeploy({ RUN_SEED: 'true' }));
    const users = context.source.getRepository(User);
    const first = await users.find({ order: { username: 'ASC' } });
    expect(first).toHaveLength(3);
    const products = await context.source.getRepository(Product).count();
    expect(products).toBeGreaterThan(0);

    await users.update({ username: 'admin' }, { fullName: 'Editado a mano' });
    await inTestEnvironment(context, () => predeploy({ RUN_SEED: 'true' }));
    expect(await users.count()).toBe(3);
    expect(await context.source.getRepository(Product).count()).toBe(products);
    expect((await users.findOneByOrFail({ username: 'admin' })).fullName).toBe(
      'Editado a mano',
    );
  });
});
