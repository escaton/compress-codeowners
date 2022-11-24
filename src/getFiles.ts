import glob from 'fast-glob';

export const getFiles = async (
    matchers: string[],
    cwd: string
): Promise<string[]> => {
    return glob(matchers, {
        cwd,
        onlyFiles: true,
    });
};
