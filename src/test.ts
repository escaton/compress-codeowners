import { parse, find } from '../../client/scripts/lint-codeowners';
import fs from 'fs/promises';
import glob from 'fast-glob';
import globToTree, { ITree } from 'glob-tree-list';
import ProgressBar from 'progress';
import { getFiles } from './getFiles';
import { getOwnershipTree } from './ownership-tree';

const main = async (testCodeownersPath: string) => {
    const originalCodeownersString = await fs.readFile('../client/CODEOWNERS', {
        encoding: 'utf8',
    });
    const testCodeownersString = await fs.readFile(testCodeownersPath, {
        encoding: 'utf8',
    });

    const files = await getFiles();
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

    let GOT_OWNED = 0;
    let MORE_OWNERS = 0;
    let DIFFERENT_OWNER = 0;
    let LESS_OWNERS = 0;

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

        if (originalOwnership.length !== testOwnership.length) {
            if (originalOwnership.length === 0) {
                GOT_OWNED++;
            } else if (originalOwnership.length > testOwnership.length) {
                LESS_OWNERS++;
            } else {
                MORE_OWNERS++;
            }
        } else if (originalOwnership.join() !== testOwnership.join()) {
            DIFFERENT_OWNER++;
            console.log(file, originalOwnership, testOwnership);
        }
    });

    console.table({
        TOTAL: [files.length, ''],
        GOT_OWNED: [GOT_OWNED, ((GOT_OWNED / files.length) * 100).toFixed(2)],
        MORE_OWNERS: [
            MORE_OWNERS,
            ((MORE_OWNERS / files.length) * 100).toFixed(2),
        ],
        LESS_OWNERS: [
            LESS_OWNERS,
            ((LESS_OWNERS / files.length) * 100).toFixed(2),
        ],
        DIFFERENT_OWNER: [
            DIFFERENT_OWNER,
            ((DIFFERENT_OWNER / files.length) * 100).toFixed(2),
        ],
    });

    console.log(
        `GOT_OWNED ${((GOT_OWNED / files.length) * 100).toFixed(
            2
        )}%, MORE_OWNERS ${((MORE_OWNERS / files.length) * 100).toFixed(
            2
        )}%, LESS_OWNERS ${((LESS_OWNERS / files.length) * 100).toFixed(
            2
        )}%, DIFFERENT_OWNER ${((DIFFERENT_OWNER / files.length) * 100).toFixed(
            2
        )}%`
    );
};

main(process.argv[2]);
