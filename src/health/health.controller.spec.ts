import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { HealthController } from './health.controller';

/**
 * The e2e spec already proves this endpoint returns 200 when the database answers and 503 when
 * it doesn't. What it cannot see is the **timeout**: Terminus defaults to 1000ms, so deleting
 * `{ timeout: 3000 }` changes real behaviour under a slow database while every e2e assertion
 * still passes. This unit test pins the option that the controller's own comment calls out as
 * deliberate ("keeps a hung database from hanging the probe itself").
 */
describe('HealthController', () => {
  let controller: HealthController;
  let health: { check: jest.Mock };
  let db: { pingCheck: jest.Mock };

  beforeEach(async () => {
    health = { check: jest.fn().mockResolvedValue({ status: 'ok' }) };
    db = {
      pingCheck: jest.fn().mockResolvedValue({ database: { status: 'up' } }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: health },
        { provide: TypeOrmHealthIndicator, useValue: db },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  describe('check', () => {
    it('runs exactly one indicator', async () => {
      await controller.check();

      expect(health.check).toHaveBeenCalledTimes(1);
      const [indicators] = health.check.mock.calls[0] as [Array<() => unknown>];
      expect(indicators).toHaveLength(1);
    });

    it('pings the database with a 3s timeout', async () => {
      await controller.check();

      // Terminus is handed thunks, not results — the indicator only runs when the health
      // service invokes it, so the assertion has to invoke it too.
      const [indicators] = health.check.mock.calls[0] as [Array<() => unknown>];
      await indicators[0]();

      expect(db.pingCheck).toHaveBeenCalledWith('database', { timeout: 3000 });
    });
  });
});
