import { describe, expect, it } from 'vitest';
import { advanceTransportStep } from './transport';

describe('advanceTransportStep', () => {
  it('advances within an arrangement', () => {
    expect(advanceTransportStep(6, 16, false)).toEqual({ nextStep: 7, finished: false });
  });

  it('finishes instead of looping at the final step', () => {
    expect(advanceTransportStep(15, 16, false)).toEqual({ nextStep: 0, finished: true });
  });

  it('wraps when looping is enabled', () => {
    expect(advanceTransportStep(15, 16, true)).toEqual({ nextStep: 0, finished: false });
  });
});