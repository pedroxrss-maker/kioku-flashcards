// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { beginAppBusy, isAppBusy, onAppBusyClear } from './appBusy';

/**
 * The busy guard is what makes the deferred service-worker reload SAFE: while a
 * long/critical op (e.g. a 35k-file .apkg import) holds it, the update reload
 * must wait. These tests pin that contract, including the exact scenario from the
 * bug report (an update arriving mid-import must not reload until the flag clears).
 */
describe('appBusy guard', () => {
  beforeEach(() => {
    window.__kiokuBusy = undefined;
  });

  it('is idle by default', () => {
    expect(isAppBusy()).toBe(false);
  });

  it('holds busy while an op runs, clears on release, and mirrors to window', () => {
    const release = beginAppBusy();
    expect(isAppBusy()).toBe(true);
    expect(window.__kiokuBusy).toBe(true);
    release();
    expect(isAppBusy()).toBe(false);
    expect(window.__kiokuBusy).toBe(false);
  });

  it('counts nested/parallel ops (busy until the LAST release)', () => {
    const r1 = beginAppBusy();
    const r2 = beginAppBusy();
    expect(isAppBusy()).toBe(true);
    r1();
    expect(isAppBusy()).toBe(true); // r2 still holds
    r2();
    expect(isAppBusy()).toBe(false);
  });

  it('release is idempotent (double-release never underflows the count)', () => {
    const r1 = beginAppBusy();
    const r2 = beginAppBusy();
    r1();
    r1(); // no-op
    expect(isAppBusy()).toBe(true); // r2 still holds it busy
    r2();
    expect(isAppBusy()).toBe(false);
  });

  it('notifies onAppBusyClear when the count returns to zero', () => {
    const spy = vi.fn();
    const off = onAppBusyClear(spy);
    const release = beginAppBusy();
    expect(spy).not.toHaveBeenCalled();
    release();
    expect(spy).toHaveBeenCalledTimes(1);
    off();
  });

  it('honors a manual window.__kiokuBusy override (force the reload to wait)', () => {
    window.__kiokuBusy = true;
    expect(isAppBusy()).toBe(true);
    window.__kiokuBusy = false;
    expect(isAppBusy()).toBe(false);
  });

  it('a guarded reload waits until busy clears, then applies once (never loops)', () => {
    // Mirrors registerPwa's safeReload(): pending + at a safe boundary, but gated.
    const reload = vi.fn();
    let updatePending = true;
    let reloaded = false;
    const safeReload = () => {
      if (!updatePending || reloaded) return;
      if (isAppBusy()) return;
      reloaded = true;
      reload();
    };

    const release = beginAppBusy(); // a fake long operation holds the flag
    safeReload(); // an update arrived + a navigation/focus boundary fires
    expect(reload).not.toHaveBeenCalled(); // NO reload while busy

    release(); // the operation finishes
    safeReload(); // next safe boundary
    expect(reload).toHaveBeenCalledTimes(1); // applied right after, exactly once

    safeReload(); // further boundaries
    expect(reload).toHaveBeenCalledTimes(1); // one-shot: never loops
    expect(updatePending).toBe(true); // (sanity) pending stays; `reloaded` gates it
  });
});
