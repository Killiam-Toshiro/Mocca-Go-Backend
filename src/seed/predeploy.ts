import { runCommand } from '../database/commands';
import { migrateFromEnvironment } from '../database/migrate';
import { seedFromEnvironment } from './main';

/** Bandera que pide sembrar durante el pre-deploy; solo vale el texto exacto `true`. */
export const SEED_FLAG = 'RUN_SEED';

export interface PredeploySteps {
  migrate(): Promise<void>;
  seed(): Promise<void>;
}

const REAL_STEPS: PredeploySteps = {
  migrate: () => migrateFromEnvironment('run'),
  seed: seedFromEnvironment,
};

/**
 * Pre-deploy de Railway: siempre aplica las migraciones y, solo si
 * `RUN_SEED=true`, ejecuta después el seed (idempotente y transaccional).
 * Si la migración falla, el seed no se ejecuta.
 */
export async function predeploy(
  environment: Record<string, string | undefined> = process.env,
  steps: PredeploySteps = REAL_STEPS,
): Promise<void> {
  await steps.migrate();
  if (environment[SEED_FLAG] === 'true') {
    console.log(`${SEED_FLAG}=true: se ejecuta el seed.`);
    await steps.seed();
  } else {
    console.log(`${SEED_FLAG} no es true: el seed se omite.`);
  }
}

if (require.main === module) void runCommand(() => predeploy());
