import { describe, expect, it } from 'vitest';
import { getMermaidQaCases } from './mermaidQaCases';

describe('Mermaid visual QA cases', () => {
    it('provides deterministic success, syntax-error and hostile-script states', () => {
        expect(getMermaidQaCases()).toEqual([
            expect.objectContaining({ id: 'valid', expectsError: false }),
            expect.objectContaining({ id: 'invalid', expectsError: true }),
            expect.objectContaining({
                id: 'malicious',
                expectsError: true,
                content: expect.stringContaining('</script>'),
            }),
        ]);
    });
});
