import { Table } from 'console-table-printer';
import fs from 'fs/promises';
import jsonDiff from 'json-diff';

import { getFiles } from './getFiles';
import { getOwnershipTree } from './ownership-tree';

const prepare = async (testCodeownersPath: string, files: string[]) => {
    const originalCodeownersString = await fs.readFile('../client/CODEOWNERS', {
        encoding: 'utf8',
    });
    const testCodeownersString = await fs.readFile(testCodeownersPath, {
        encoding: 'utf8',
    });

    const originalOwnershipTree = await getOwnershipTree(
        files,
        originalCodeownersString,
        true
    );
    const testOwnershipTree = await getOwnershipTree(
        files,
        testCodeownersString,
        false
    );

    return [originalOwnershipTree, testOwnershipTree];
};

const main = async (testCodeownersPath: string) => {
    const files = await getFiles();
    const [originalOwnershipTree, testOwnershipTree] = await prepare(
        testCodeownersPath,
        files
    );

    const teamsStat: Record<string, { original: number; test: number }> = {};

    files.forEach((file) => {
        const originalOwnership = originalOwnershipTree
            .getFileOwnership('/' + file)
            .map(([team]) => team)
            .sort();
        const testOwnership = testOwnershipTree
            .getFileOwnership('/' + file)
            .map(([team]) => team)
            .sort();

        originalOwnership.forEach((team) => {
            if (!teamsStat[team]) {
                teamsStat[team] = {
                    original: 0,
                    test: 0,
                };
            }
            teamsStat[team].original++;
        });

        testOwnership.forEach((team) => {
            if (!teamsStat[team]) {
                teamsStat[team] = {
                    original: 0,
                    test: 0,
                };
            }
            teamsStat[team].test++;
        });
    });

    const table = new Table({
        columns: [
            { name: 'team', alignment: 'left' }, // with alignment and color
            { name: 'original', alignment: 'right' },
            { name: 'diff', alignment: 'right' },
            { name: 'repo', alignment: 'right' },
        ],
    });

    const formatPercent = (val: number) => {
        return (val * 100).toFixed(2) + '%';
    };

    let totalOwnershipChange = 0;
    Object.entries(teamsStat)
        .sort(
            ([, a], [, b]) =>
                Math.abs(b.test - b.original) / files.length -
                Math.abs(a.test - a.original) / files.length
        )
        .forEach(([team, { original, test }]) => {
            const sign = test - original > 0 ? '+' : '';

            totalOwnershipChange += Math.abs((test - original) / files.length);
            table.addRow({
                team,
                original: original,
                diff: `${sign}${test - original}`,
                repo: sign + formatPercent((test - original) / files.length),
            });
        });

    table.printTable();
    console.log(
        'Total ownership change:',
        formatPercent(totalOwnershipChange)
    );
};

const testSpecificFile = async (
    testCodeownersPath: string,
    specificFile: string
) => {
    const [originalOwnershipTree, testOwnershipTree] = await prepare(
        testCodeownersPath,
        [specificFile]
    );

    const originalOwnership = originalOwnershipTree
        .getFileOwnership('/' + specificFile)
        .map(([team]) => team)
        .filter((team) => team !== 'none')
        .sort();
    const testOwnership = testOwnershipTree
        .getFileOwnership('/' + specificFile)
        .map(([team]) => team)
        .filter((team) => team !== 'none')
        .sort();

    const diff = jsonDiff.diffString(originalOwnership, testOwnership);
    if (diff.length > 0) {
        console.log(diff);
    } else {
        console.log("Ownership hasn't changed!");
    }
};

const [, , testCodeownersPath, specificFile] = process.argv;

if (specificFile) {
    testSpecificFile(testCodeownersPath, specificFile);
} else {
    main(testCodeownersPath);
}
