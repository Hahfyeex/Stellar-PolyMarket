import React from 'react';
import { render } from '@testing-library/react';
import LiquidityHeatmap from '../LiquidityHeatmap';

describe('LiquidityHeatmap', () => {
  it('renders blue with opacity relative to total pool for YES side (index 0)', () => {
    const poolDepth = { "0": 1000, "1": 3000 };
    const { getByTestId } = render(
      <LiquidityHeatmap poolDepth={poolDepth} totalPool={4000} outcomeIndex={0} />
    );
    const element = getByTestId('heatmap-overlay-0');
    expect(element.className).toContain('bg-blue-500');
    // For ratio 1000/4000 = 0.25, max opacity is 0.4 -> 0.25 * 0.4 = 0.1
    expect(element.style.opacity).toBe('0.1');
  });

  it('renders orange with opacity relative to total pool for NO side (index 1)', () => {
    const poolDepth = { "0": 1000, "1": 3000 };
    const { getByTestId } = render(
      <LiquidityHeatmap poolDepth={poolDepth} totalPool={4000} outcomeIndex={1} />
    );
    const element = getByTestId('heatmap-overlay-1');
    expect(element.className).toContain('bg-orange-500');
    // For ratio 3000/4000 = 0.75, max opacity is 0.4 -> 0.75 * 0.4 = 0.3
    expect(element.style.opacity).toBe('0.3');
  });

  it('renders zero opacity when pool is empty (edge case)', () => {
    const poolDepth = {};
    const { getByTestId } = render(
      <LiquidityHeatmap poolDepth={poolDepth} totalPool={0} outcomeIndex={0} />
    );
    const element = getByTestId('heatmap-overlay-0');
    expect(element.style.opacity).toBe('0');
  });

  it('renders 100% relative opacity for a single bettor (edge case)', () => {
    const poolDepth = { "0": 500 };
    const { getByTestId } = render(
      <LiquidityHeatmap poolDepth={poolDepth} totalPool={500} outcomeIndex={0} />
    );
    const element = getByTestId('heatmap-overlay-0');
    // max opacity is 0.4, 100% relative = 0.4
    expect(element.style.opacity).toBe('0.4');
  });

  it('does not block interactions (has pointer-events-none)', () => {
    const { getByTestId } = render(
      <LiquidityHeatmap poolDepth={{}} totalPool={0} outcomeIndex={0} />
    );
    const element = getByTestId('heatmap-overlay-0');
    expect(element.className).toContain('pointer-events-none');
  });
});
