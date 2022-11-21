import glob from 'fast-glob';

export const getFiles = async (): Promise<string[]> => {
    return glob(
        [
            '**/*.(js|jsx|ts|tsx)',
            '!**/node_modules',
        ],
        {
            cwd: '../your-repo',
            onlyFiles: true,
        }
    );
};
