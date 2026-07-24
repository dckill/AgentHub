import { describe, expect, it } from 'vitest';
import { getFolderBrowserRecommendedPaths, getParentDirectory } from './folderBrowserPath';

describe('getParentDirectory', () => {
    it('returns the filesystem parent for Unix paths', () => {
        expect(getParentDirectory('/Users/me/project')).toBe('/Users/me');
        expect(getParentDirectory('/Users/me')).toBe('/Users');
        expect(getParentDirectory('/')).toBeNull();
    });

    it('returns the filesystem parent for Windows paths', () => {
        expect(getParentDirectory('C:\\Users\\me\\project')).toBe('C:\\Users\\me');
        expect(getParentDirectory('C:\\Users')).toBe('C:\\');
        expect(getParentDirectory('C:\\')).toBeNull();
    });
});

describe('getFolderBrowserRecommendedPaths', () => {
    it('keeps only the filesystem root and the user home directory', () => {
        expect(getFolderBrowserRecommendedPaths('/home/dev', [
            '/home/dev/workspace/project',
            '/tmp/scratch',
        ])).toEqual(['/', '/home/dev']);
    });

    it('deduplicates home when it is the root directory', () => {
        expect(getFolderBrowserRecommendedPaths('/', ['/home/dev/project'])).toEqual(['/']);
    });

    it('uses the drive root for Windows home directories', () => {
        expect(getFolderBrowserRecommendedPaths('C:\\Users\\dev', [
            'C:\\Users\\dev\\project',
            'D:\\tmp',
        ])).toEqual(['C:\\', 'C:\\Users\\dev']);
    });
});
