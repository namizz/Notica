import 'reflect-metadata';
import type { Type } from '@nestjs/common';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsService } from './notifications.service';

/**
 * Reads the providers the module would register for a given APP_ROLE. The
 * module decides this at import time, so each case needs a fresh module
 * registry.
 */
function providersForRole(role: string | undefined): Type<unknown>[] {
  const previous = process.env.APP_ROLE;

  if (role === undefined) {
    delete process.env.APP_ROLE;
  } else {
    process.env.APP_ROLE = role;
  }

  let providers: Type<unknown>[] = [];
  try {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const module = require('./notifications.module') as {
        NotificationsModule: Type<unknown>;
      };
      providers =
        (Reflect.getMetadata(
          'providers',
          module.NotificationsModule,
        ) as Type<unknown>[]) ?? [];
    });
  } finally {
    if (previous === undefined) {
      delete process.env.APP_ROLE;
    } else {
      process.env.APP_ROLE = previous;
    }
  }

  return providers;
}

function names(providers: Type<unknown>[]): string[] {
  return providers.map((provider) => provider.name);
}

describe('NotificationsModule role wiring', () => {
  it('registers the delivery processor by default', () => {
    // No APP_ROLE set is the existing single-service deployment, which must
    // keep consuming the queue exactly as before.
    expect(names(providersForRole(undefined))).toEqual([
      NotificationsService.name,
      NotificationsProcessor.name,
    ]);
  });

  it('registers the delivery processor for the combined role', () => {
    expect(names(providersForRole('all'))).toContain(
      NotificationsProcessor.name,
    );
  });

  it('registers the delivery processor for the worker role', () => {
    expect(names(providersForRole('worker'))).toContain(
      NotificationsProcessor.name,
    );
  });

  it('omits the delivery processor for the api role', () => {
    const providers = names(providersForRole('api'));

    expect(providers).toContain(NotificationsService.name);
    expect(providers).not.toContain(NotificationsProcessor.name);
  });

  it('always keeps the ingestion service so the api role can still enqueue', () => {
    for (const role of [undefined, 'all', 'api', 'worker']) {
      expect(names(providersForRole(role))).toContain(
        NotificationsService.name,
      );
    }
  });

  it('refuses to load with an unrecognised role', () => {
    expect(() => providersForRole('workers')).toThrow(
      'APP_ROLE must be one of all, api, worker; received "workers"',
    );
  });
});
