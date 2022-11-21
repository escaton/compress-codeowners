import { Table } from 'console-table-printer';
import fs from 'fs/promises';
import jsonDiff from 'json-diff';

import { getFiles } from './getFiles';
import { getOwnershipTree } from './ownership-tree';

const prepare = async (
    originalCodeownersPath: string,
    testCodeownersPath: string,
    files: string[]
) => {
    const originalCodeownersString = await fs.readFile(originalCodeownersPath, {
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

export const diffAll = async (
    originalCodeownersPath: string,
    testCodeownersPath: string,
    forTeam?: string
) => {
    const files = await getFiles();
    const [originalOwnershipTree, testOwnershipTree] = await prepare(
        originalCodeownersPath,
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
            { name: 'team', alignment: 'left' },
            { name: 'original' },
            { name: 'diff', alignment: 'center' },
        ],
    });

    const formatPercent = (val: number) => {
        return (val * 100).toFixed(2) + '%';
    };

    let totalOwnershipLost = 0;
    let totalOwnershipAdded = 0;
    Object.entries(teamsStat)
        .map(([team, { original, test }]) => {
            let diff: [string][] = jsonDiff.diff(original, test) || [];
            const lost = diff.filter(([sign]) => sign === '-').length;
            const gained = diff.filter(([sign]) => sign === '+').length;
            totalOwnershipLost += lost;
            totalOwnershipAdded += gained;
            return [
                team,
                original.length,
                `-${lost}`.padStart(5) + '/' + `${gained}+`.padEnd(5),
                gained / files.length,
            ] as const;
        })
        .sort(([, , , a], [, , , b]) => b - a)
        .forEach(([team, original, diff, relative]) => {
            table.addRow({
                team,
                original,
                diff,
            });
        });

    table.printTable();
    console.log(
        'Total ownership change:',
        '-' + formatPercent(totalOwnershipLost / files.length),
        '+' + formatPercent(totalOwnershipAdded / files.length)
    );

    if (forTeam) {
        console.log(`Team #${forTeam} ownership change:`);
        console.log(
            jsonDiff.diffString(
                teamsStat['#' + forTeam].original,
                teamsStat['#' + forTeam].test,
                {
                    maxElisions: 1,
                }
            )
        );
    }
};

export const diffSpecificFile = async (
    originalCodeownersPath: string,
    testCodeownersPath: string,
    specificFile: string
) => {
    const [originalOwnershipTree, testOwnershipTree] = await prepare(
        originalCodeownersPath,
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
