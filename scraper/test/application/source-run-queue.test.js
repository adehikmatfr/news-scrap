import { describe, expect, it } from 'bun:test';
import { SourceRunQueue } from '../../src/application/source-run-queue.js';
import { ControlledScrapeSource, silentLogger, tick } from './fakes.js';

const a = { name: 'a' };
const b = { name: 'b' };

function setup() {
  const scrapeSource = new ControlledScrapeSource();
  const queue = new SourceRunQueue({ scrapeSource, logger: silentLogger });
  return { scrapeSource, queue };
}

describe('SourceRunQueue', () => {
  it('runs one source at a time, in arrival order', async () => {
    const { scrapeSource, queue } = setup();
    const doneA = queue.enqueue(a);
    const doneB = queue.enqueue(b);
    await tick();

    expect(scrapeSource.started).toEqual(['a']);
    expect(queue.snapshot('a').state).toBe('running');
    expect(queue.snapshot('b').state).toBe('queued');

    scrapeSource.finish('a');
    await doneA;
    await tick();
    expect(scrapeSource.started).toEqual(['a', 'b']);

    scrapeSource.finish('b', { published: 3, failed: 1 });
    const result = await doneB;
    expect(result).toMatchObject({ published: 3, failed: 1, error: null });
    expect(queue.snapshot('b')).toMatchObject({ state: 'idle', lastRun: { published: 3, failed: 1 } });
  });

  it('does not enqueue a source that is already queued or running', async () => {
    const { scrapeSource, queue } = setup();
    const first = queue.enqueue(a);
    const second = queue.enqueue(a);
    await tick();

    expect(second).toBe(first);
    scrapeSource.finish('a');
    await first;
    expect(scrapeSource.started).toEqual(['a']);
  });

  it('records a failed run without rejecting, and keeps serving other sources', async () => {
    const { scrapeSource, queue } = setup();
    const doneA = queue.enqueue(a);
    const doneB = queue.enqueue(b);
    await tick();

    scrapeSource.fail('a', 'RSS down');
    expect(await doneA).toMatchObject({ published: 0, failed: 0, error: 'RSS down' });
    expect(queue.snapshot('a').lastRun.error).toBe('RSS down');

    await tick();
    scrapeSource.finish('b');
    expect((await doneB).error).toBeNull();
  });

  it('on close: drops queued sources, signals the running one to stop, and resolves when it finishes', async () => {
    const { scrapeSource, queue } = setup();
    queue.enqueue(a);
    const doneB = queue.enqueue(b);
    await tick();

    const closed = queue.close();
    expect(await doneB).toBeNull();
    expect(queue.snapshot('b').state).toBe('idle');
    expect(scrapeSource.stopChecks.get('a')()).toBe(true);

    let resolved = false;
    closed.then(() => (resolved = true));
    await tick();
    expect(resolved).toBe(false);

    scrapeSource.finish('a');
    await closed;
    expect(scrapeSource.started).toEqual(['a']);
    expect(await queue.enqueue(a)).toBeNull();
  });
});
