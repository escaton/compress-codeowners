export const readFilesFromStdin = async (): Promise<string[]> => {
    if (process.stdin.isTTY) {
        throw new Error('Expect file list passed as stdin');
    }

    return new Promise((resolve) => {
        let result = '';
        const stream = process.openStdin();
        stream.on('data', (buffer) => {
            result += buffer.toString('utf8');
        });
        stream.on('end', () => {
            resolve(
                result
                    .split('\n')
                    .map((line) => line.trim())
                    .filter((line) => line.length > 0 && !line.startsWith('#'))
            );
        });
    });
};
