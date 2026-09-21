import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions } from '../../routes/boards/[id]/+page.server.js';

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock('$lib/server/api.js', () => ({ apiFetch, readJson: vi.fn() }));

const WIDGET_ID = '4f9d8a3e-6c1b-4e57-9a52-0d1b7b0a1c11';

function run(widgetId?: string) {
  const action = actions.deleteWidget;
  if (!action) throw new Error('the deleteWidget action is not exported');

  const form = new FormData();
  if (widgetId !== undefined) form.set('widgetId', widgetId);

  return action({
    request: { formData: async () => form },
    params: { id: 'board-1' },
  } as never);
}

beforeEach(() => {
  apiFetch.mockReset();
});

describe('deleteWidget action (US-W4, Task #211)', () => {
  it('deletes through the api and answers with plain success', async () => {
    apiFetch.mockResolvedValue(new Response(null, { status: 200 }));

    const result = await run(WIDGET_ID);

    expect(result).toBeUndefined();
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith(expect.anything(), `/v1/widgets/${WIDGET_ID}`, {
      method: 'DELETE',
    });
  });

  it('treats a 404 as success: the widget is already gone', async () => {
    apiFetch.mockResolvedValue(new Response(null, { status: 404 }));

    expect(await run(WIDGET_ID)).toBeUndefined();
  });

  it('answers with a failure when the api refuses', async () => {
    apiFetch.mockResolvedValue(new Response(null, { status: 500 }));

    const result = await run(WIDGET_ID);

    expect(result).toMatchObject({ status: expect.any(Number) });
  });

  it('rejects a missing or empty widget id without calling the api', async () => {
    expect(await run()).toMatchObject({ status: 400 });
    expect(await run('')).toMatchObject({ status: 400 });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('escapes the widget id before it reaches the api path', async () => {
    apiFetch.mockResolvedValue(new Response(null, { status: 200 }));

    await run('../boards');

    expect(apiFetch).toHaveBeenCalledWith(expect.anything(), '/v1/widgets/..%2Fboards', {
      method: 'DELETE',
    });
  });
});
