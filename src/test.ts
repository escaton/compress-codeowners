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
        testCodeownersString.replace(/path:/g, ''),
        false
    );

    return [originalOwnershipTree, testOwnershipTree];
};

const main = async (testCodeownersPath: string, forTeam?: string) => {
    const files = await getFiles();
    const [originalOwnershipTree, testOwnershipTree] = await prepare(
        testCodeownersPath,
        files
    );

    const teamsStat: Record<string, { original: string[]; test: string[] }> =
        {};

    files.forEach((file) => {
        const originalOwnership = originalOwnershipTree
            .getFileOwnership('/' + file)
            .map(([team]) => team)
            .filter((team) => team !== 'none')
            .sort();
        const testOwnership = testOwnershipTree
            .getFileOwnership('/' + file)
            .map(([team]) => team)
            .filter((team) => team !== 'none')
            .sort();

        originalOwnership.forEach((team) => {
            if (!teamsStat[team]) {
                teamsStat[team] = {
                    original: [],
                    test: [],
                };
            }
            teamsStat[team].original.push(file);
        });

        testOwnership.forEach((team) => {
            if (!teamsStat[team]) {
                teamsStat[team] = {
                    original: [],
                    test: [],
                };
            }
            teamsStat[team].test.push(file);
        });
    });

    const table = new Table({
        columns: [
            { name: 'team', alignment: 'left' }, // with alignment and color
            { name: 'original', alignment: 'right' },
            { name: 'diff', alignment: 'right' },
            { name: 'repo', alignment: 'right', title: 'repo scale' },
        ],
    });

    const formatPercent = (val: number) => {
        return (val * 100).toFixed(2) + '%';
    };

    let totalOwnershipAdded = 0;
    let totalOwnershipLost = 0;
    Object.entries(teamsStat)
        .map(
            ([team, { original, test }]) =>
                [
                    team,
                    { original: original.length, test: test.length },
                    Math.abs(test.length - original.length) / files.length,
                ] as [
                    team: string,
                    stats: { original: number; test: number },
                    sortBy: number
                ]
        )
        .sort(([, , a], [, , b]) => b - a)
        .forEach(([team, { original, test }]) => {
            const sign = test - original > 0 ? '+' : '';

            if (test < original) {
                totalOwnershipLost += (test - original) / files.length;
            } else {
                totalOwnershipAdded += (test - original) / files.length;
            }
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
        formatPercent(totalOwnershipLost),
        '+' + formatPercent(totalOwnershipAdded)
    );

    if (forTeam) {
        console.log(
            jsonDiff.diffString(
                teamsStat[forTeam].original,
                teamsStat[forTeam].test,
                {
                    maxElisions: 1,
                }
            )
        );
    }
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

const [, , testCodeownersPath, details] = process.argv;

if (details) {
    if (details.startsWith('#')) {
        main(testCodeownersPath, details);
    } else {
        testSpecificFile(testCodeownersPath, details);
    }
} else {
    main(testCodeownersPath);
}
