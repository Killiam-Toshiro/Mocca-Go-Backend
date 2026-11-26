import { predeploy, PredeploySteps } from '../../src/seed/predeploy';

function steps(order: string[], failMigration = false): PredeploySteps {
  return {
    migrate: () => {
      order.push('migrate');
      return failMigration
        ? Promise.reject(new Error('fallo'))
        : Promise.resolve();
    },
    seed: () => {
      order.push('seed');
      return Promise.resolve();
    },
  };
}

describe('predeploy', () => {
  let log: jest.SpyInstance;
  beforeEach(() => {
    log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => log.mockRestore());

  it.each([undefined, '', 'false', 'TRUE', '1', ' true', 'true '])(
    'con RUN_SEED=%j solo migra',
    async (value) => {
      const order: string[] = [];
      await predeploy({ RUN_SEED: value }, steps(order));
      expect(order).toEqual(['migrate']);
    },
  );

  it('con RUN_SEED=true migra y después siembra', async () => {
    const order: string[] = [];
    await predeploy({ RUN_SEED: 'true' }, steps(order));
    expect(order).toEqual(['migrate', 'seed']);
  });

  it('si la migración falla no siembra y propaga el error', async () => {
    const order: string[] = [];
    await expect(
      predeploy({ RUN_SEED: 'true' }, steps(order, true)),
    ).rejects.toThrow('fallo');
    expect(order).toEqual(['migrate']);
  });
});
