import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleMainError } from './mainErrorHandling';

describe('handleMainError', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('记录启动失败并保留非零退出码', () => {
        const error = new Error('startup failed');
        const setExitCode = vi.fn();
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        handleMainError(error, setExitCode);

        expect(consoleError).toHaveBeenCalledWith(error);
        expect(setExitCode).toHaveBeenCalledWith(1);
    });
});
