import fs from 'fs/promises';
import { PriorityQueue } from '@datastructures-js/priority-queue';
import { difference as setDifference } from 'set-operations';

import { getFiles } from './getFiles';
import { OwnershipTree, getOwnershipTree } from './ownership-tree';
import { mapsKeysAreSame } from './utils';

class Entry {
    private debugInitialOwnership: Map<string, [count: number, key: string]>;
    private internalOwnership: Map<string, [count: number, key: string]>;
    ownership: Map<string, [count: number, key: string]>;
    path: string;
    parentEntry?: Entry;
    children: Entry[] = [];
    constructor(tree: OwnershipTree, parentEntry?: Entry) {
        this.internalOwnership = new Map(tree.ownership);
        this.ownership = new Map(tree.ownership);
        this.debugInitialOwnership = new Map(tree.ownership);

        this.path = tree.path;
        if (parentEntry) {
            this.parentEntry = parentEntry;
            parentEntry.addChild(this);
        }
    }
    addChild(entry: Entry) {
        this.children.push(entry);
    }
    subtractTeamCount(team: string, diffCount: number) {
        const [currentCount, key] = this.internalOwnership.get(team) || [];
        if (currentCount === undefined || key === undefined) {
            throw new Error('Impossible');
        }
        if (currentCount > 0) {
            const newCount = currentCount - diffCount;
            if (newCount >= 0) {
                this.internalOwnership.set(team, [newCount, key]);
                const maxCount =
                    [...this.internalOwnership]
                        .map(([, [count]]) => count)
                        .sort((a, b) => a - b)
                        .pop() || 0;
                this.ownership = new Map(
                    [...this.internalOwnership].filter(
                        ([, [count]]) => count > 0 && count > maxCount * 0.5
                    )
                );
            } else {
                throw new Error('Impossible');
            }
        } else {
            throw new Error('Impossible');
        }
    }

    private isVisible(): boolean {
        return !(
            this.parentEntry &&
            mapsKeysAreSame(this.ownership, this.parentEntry.ownership)
        );
    }

    hasVaryOwnership() {
        const uniqKeys = new Set(
            [...this.ownership.values()].map(([, key]) => key)
        );
        return uniqKeys.size > 1;
    }

    toString(debug: boolean = false) {
        let result = '';
        if (this.isVisible()) {
            const teams = [...this.ownership.entries()]
                .filter(([team, [number]]) => {
                    if (number <= 0) {
                        throw new Error('Impossible');
                    }
                    // number should be always > 0
                    if (number > 0 && team !== 'none') {
                        return true;
                    }
                    return false;
                })
                .map(([team]) => team);
            if (teams.length > 0) {
                result = `${this.path} ${teams.join(' ')}\n`;
            }
        }
        if (debug) {
            result = [
                `# initial ownership:`,
                ...[...this.debugInitialOwnership.entries()]
                    .sort((a, b) => b[1][0] - a[1][0])
                    .map(([team, [count]]) => {
                        return `#    ${[
                            this.ownership.has(team) ? '        ' : 'narrowed',
                            `${
                                this.internalOwnership.get(team)![0]
                            }/${count}`.padEnd(10),
                            team,
                        ].join(' ')}`;
                    }),
                result === '' ? `# ${this.path}\n` : result,
                '',
            ].join('\n');
        }
        return result;
    }
    get size(): number {
        return this.toString().length;
    }
}

async function main(outputPath: string) {
    console.log('Searching files...');

    const files = await getFiles();

    console.log(`Found ${files.length} files`);

    const root = await getOwnershipTree(
        files,
        await fs.readFile('../client/CODEOWNERS', { encoding: 'utf8' }),
        true
    );

    const getBudget = (entries: Entry[]) => {
        return entries.reduce((acc, entry) => acc + entry.size, 0);
    };

    const entries: Entry[] = [];
    const MAX_BUDGET = 100000;

    const queue = new PriorityQueue<{
        tree: OwnershipTree;
        parentEntry?: Entry;
    }>((a, b) => {
        return b.tree.size - a.tree.size;
    });

    queue.enqueue({ tree: root });
    while (queue.size() > 0) {
        const { tree, parentEntry } = queue.dequeue();
        const currentEntry = new Entry(tree, parentEntry);

        if (MAX_BUDGET - getBudget(entries) > currentEntry.size) {
            entries.push(currentEntry);
        } else {
            break;
        }

        for (let [team, [count]] of currentEntry.ownership.entries()) {
            parentEntry?.subtractTeamCount(team, count);
        }

        // TODO maybe better?
        if (getBudget(entries) > MAX_BUDGET) {
            for (let [team, [count]] of currentEntry.ownership.entries()) {
                parentEntry?.subtractTeamCount(team, -count);
            }
            break
        }

        if (currentEntry.hasVaryOwnership()) {
            tree.chilren.forEach((child) => {
                queue.enqueue({
                    tree: child,
                    parentEntry: currentEntry,
                });
            });
        }
    }

    const newCodeowners = entries
        .sort((a, b) => (a.path < b.path ? -1 : 1))
        .map((entry) => entry.toString(Boolean(process.env.DEBUG)))
        .join('');

    console.log(`Saving to ${outputPath}`);
    await fs.writeFile(outputPath, newCodeowners);
}

main(process.argv[2]);
