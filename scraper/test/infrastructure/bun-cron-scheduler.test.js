import { describe, expect, it } from 'bun:test';
import { BunCronScheduler } from '../../src/infrastructure/scheduling/bun-cron-scheduler.js';

describe('BunCronScheduler', () => {
  it('computes the next run in the configured timezone', () => {
    const scheduler = new BunCronScheduler({ timezone: 'Asia/Jakarta' });
    const from = new Date('2026-11-02T00:00:00Z'); // 07:00 WIB

    expect(scheduler.nextRun({ schedule: '0 7 * * *' }, from).toISOString()).toBe('2026-11-03T00:00:00.000Z');
    expect(scheduler.nextRun({ schedule: '*/15 * * * *' }, from).toISOString()).toBe('2026-11-02T00:15:00.000Z');
  });

  it('schedules one job per source and stops them all', () => {
    const scheduler = new BunCronScheduler({ timezone: 'Asia/Jakarta' });
    scheduler.schedule({ name: 'a', schedule: '0 * * * *' }, async () => {});
    scheduler.schedule({ name: 'b', schedule: '@daily' }, async () => {});
    expect(() => scheduler.stopAll()).not.toThrow();
  });
});
