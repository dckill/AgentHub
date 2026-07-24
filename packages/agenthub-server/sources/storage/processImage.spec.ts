import sharp from 'sharp';
import { processImage } from './processImage';
import { describe, expect, it } from 'vitest';

describe('processImage', () => {
    it('should resize image', async () => {
        const img = await sharp({
            create: {
                width: 200,
                height: 100,
                channels: 3,
                background: { r: 120, g: 80, b: 40 },
            },
        }).png().toBuffer();

        const result = await processImage(img);

        expect(result.format).toBe('png');
        expect(result.width).toBe(200);
        expect(result.height).toBe(100);
        expect(result.pixels).toHaveLength(100 * 50 * 4);
        expect(result.thumbhash).toEqual(expect.any(String));
        expect(result.thumbhash.length).toBeGreaterThan(0);
    });
});
