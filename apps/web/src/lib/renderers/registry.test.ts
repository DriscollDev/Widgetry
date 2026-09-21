// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import { WIDGET_TYPE_DEFS } from '@widgetry/shared';
import FallbackRenderer from './FallbackRenderer.svelte';
import { registeredWidgetTypes, rendererFor } from './registry';

afterEach(() => {
  cleanup();
});

const catalogTypes = Object.keys(WIDGET_TYPE_DEFS);

describe('renderer registry (Story #223, FR-3.6, EX-22/EX-23)', () => {
  it('has all seven MVP widget types in the catalog (FR-3.6)', () => {
    expect(catalogTypes).toHaveLength(7);
    for (const type of ['uptime', 'weather', 'clock', 'custom_json']) {
      expect(catalogTypes).toContain(type);
    }
  });

  it('resolves every catalog type to a renderer', () => {
    for (const type of catalogTypes) {
      expect(typeof rendererFor(type), type).toBe('function');
    }
  });

  it('falls back for a type with no renderer', () => {
    expect(rendererFor('not-a-widget')).toBe(FallbackRenderer);
    expect(rendererFor('constructor')).toBe(FallbackRenderer);
    expect(rendererFor('__proto__')).toBe(FallbackRenderer);
  });

  it('registers only types the catalog knows', () => {
    for (const type of registeredWidgetTypes()) {
      expect(catalogTypes).toContain(type);
    }
  });
});

describe('FallbackRenderer', () => {
  it('shows the widget type as text', () => {
    render(FallbackRenderer, { props: { widget: { id: 'w1', widgetType: 'weather' } } });
    expect(screen.getByText('weather')).toBeTruthy();
  });
});
