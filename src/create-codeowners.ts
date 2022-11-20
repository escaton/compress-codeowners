import fs from 'fs/promises';
import { PriorityQueue } from '@datastructures-js/priority-queue';
import { difference as setDifference } from 'set-operations';
import ProgressBar from 'progress';

import { getFiles } from './getFiles';
import { OwnershipTree, getOwnershipTree } from './ownership-tree';

let cacheHit = 0;
let cacheMiss = 0;

class Entry {
    private debugInitialOwnership: Map<string, [count: number, key: string]>;
    private internalOwnership: Map<string, [count: number, key: string]>;
    private treeSize: number;
    ownership: Map<string, [count: number, key: string]>;
    ownershipString: string;
    path: string;
    parentEntry?: Entry;
    children: Entry[] = [];
    constructor(tree: OwnershipTree, parentEntry?: Entry) {
        this.treeSize = tree.size;
        this.debugInitialOwnership = new Map(tree.ownership);
        this.internalOwnership = new Map(tree.ownership);
        this.ownership = new Map(tree.ownership);
        this.ownershipString = Array.from(this.ownership.keys()).join('');

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

                this.ownership = this.calcOwnership();
                const newOwnershipString = Array.from(
                    this.ownership.keys()
                ).join('');

                if (this.ownershipString !== newOwnershipString) {
                    this.cachedString = undefined;
                }

                this.ownershipString = newOwnershipString;
            } else {
                throw new Error('Impossible');
            }
        } else {
            throw new Error('Impossible');
        }
    }

    private calcOwnership() {
        let sum = 0;
        const maxCount =
            [...this.internalOwnership]
                .map(([, [count]]) => ((sum += count), count))
                .sort((a, b) => a - b)
                .pop() || 0;

        let filteredOwnership = [...this.internalOwnership].filter(
            ([, [count]]) => count > maxCount * 0.8 /* && count >= sum */
        );

        // if (this.path === '/application/src/lazy-modules/board/lazy-modules/') {
        //     console.log(filteredOwnership, maxCount, sum)
        // }
        // filteredOwnership = filteredOwnership.filter(([, [count]]) => {

        // })
        // if (
        //     filteredOwnership.length === 1 &&
        //     filteredOwnership[0][1][0] < this.treeSize
        // ) {
        //     filteredOwnership = [];
        // }
        return new Map(filteredOwnership);
    }

    private isUnlikeParent(): boolean {
        let visibleParent = this.parentEntry;
        while (visibleParent) {
            if (visibleParent.size > 0) {
                break;
            }
            visibleParent = visibleParent.parentEntry;
        }

        if (visibleParent) {
            return this.ownershipString !== visibleParent.ownershipString;
        }
        return true;
    }

    hasVaryOwnership() {
        const uniqKeys = new Set(
            [...this.ownership.values()].map(([, key]) => key)
        );
        return uniqKeys.size > 1;
    }

    private cachedString: string | undefined = undefined;
    toString(debug: boolean = false) {
        let result = '';
        if (this.isUnlikeParent()) {
            if (this.cachedString !== undefined) {
                result = this.cachedString;
            } else {
                const teams = [...this.ownership.entries()]
                    .filter(([team, [count]]) => {
                        if (count <= 0) {
                            throw new Error('Impossible');
                        }
                        // number should be always > 0
                        if (count > 0 && team !== 'none') {
                            // if (count > 1) {
                            return true;
                            // }
                        }
                        return false;
                    })
                    .map(([team]) => team);
                if (teams.length > 0) {
                    result = this.cachedString = `${this.path} ${teams.join(
                        ' '
                    )}\n`;
                }
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

    const MAX_BUDGET = 100000;
    let lastBudget = 0;
    const entries: Entry[] = [];
    const getBudget = (entries: Entry[]) => {
        return entries.reduce((acc, entry) => acc + entry.size, 0);
    };
    const modifyEntries = (cb: () => void, rollback: () => void) => {
        cb();
        const budget = getBudget(entries);
        if (budget > MAX_BUDGET) {
            rollback();
            throw 'finish';
        }
        lastBudget = budget;
    };

    const queue = new PriorityQueue<{
        tree: OwnershipTree;
        parentEntry?: Entry;
    }>((a, b) => {
        return b.tree.size - a.tree.size;
    });

    queue.enqueue({ tree: root });

    const progress = new ProgressBar('[:bar]', {
        total: MAX_BUDGET,
        width: 80,
        complete: '█',
        incomplete: '_',
        clear: true,
    });
    try {
        while (queue.size() > 0) {
            const { tree, parentEntry } = queue.dequeue();
            const currentEntry = new Entry(tree, parentEntry);

            modifyEntries(
                () => entries.push(currentEntry),
                () => entries.pop()
            );

            if (parentEntry) {
                for (let [team, [count]] of currentEntry.ownership.entries()) {
                    modifyEntries(
                        () => parentEntry.subtractTeamCount(team, count),
                        () => parentEntry.subtractTeamCount(team, -count)
                    );
                }
            }

            progress.update(lastBudget / MAX_BUDGET);
            progress.tick();

            if (currentEntry.hasVaryOwnership()) {
                tree.chilren.forEach((child) => {
                    queue.enqueue({
                        tree: child,
                        parentEntry: currentEntry,
                    });
                });
            }
        }
    } catch (e) {
        if (e !== 'finish') {
            throw e;
        }
    }

    progress.terminate();

    console.log('cacheHit/cacheMiss', `${cacheHit}/${cacheMiss}`);

    const newCodeowners = entries
        .sort((a, b) => (a.path < b.path ? -1 : 1))
        .map((entry) => entry.toString(Boolean(process.env.DEBUG)))
        .join('');

    console.log(`Saving to ${outputPath}`);
    await fs.writeFile(outputPath, newCodeowners);
}

main(process.argv[2]);
