import fs from 'fs/promises';
import { PriorityQueue } from '@datastructures-js/priority-queue';

import { getFiles } from './getFiles';
import { OwnershipTree, getOwnershipTree } from './ownership-tree';
import { mapsKeysAreSame } from './utils';

class Entry {
    ownership: Map<string, number>;
    path: string;
    parentEntry?: Entry;
    children: Entry[] = [];
    constructor(tree: OwnershipTree, parentEntry?: Entry) {
        this.ownership = new Map(tree.ownership);
        this.path = tree.path;
        if (parentEntry) {
            this.parentEntry = parentEntry;
            parentEntry.addChild(this);
        }
    }
    addChild(entry: Entry) {
        this.children.push(entry);
    }
    subtractTeamCount(team: string, count: number) {
        const teamCount = this.ownership.get(team);
        if (teamCount === undefined) {
            throw new Error('Impossible');
        }
        if (teamCount > 0) {
            const newCount = teamCount - count;
            if (newCount === 0) {
                this.ownership.delete(team);
            } else if (newCount > 0) {
                this.ownership.set(team, newCount);
            } else {
                throw new Error('Impossible');
            }
        } else {
            throw new Error('Impossible');
        }
    }

    isVisible(): boolean {
        return !(
            this.parentEntry &&
            mapsKeysAreSame(this.ownership, this.parentEntry.ownership)
        );
    }

    toString() {
        if (!this.isVisible()) {
            return '';
        }
        const teams = [...this.ownership.entries()]
            .filter(([team, number]) => {
                // number should be always > 0
                if (number > 0 && team !== 'none') {
                    return true;
                }
                return false;
            })
            .map(([team]) => team);
        if (teams.length > 0) {
            return `${this.path} ${teams.join(' ')}\n`;
        }
        return '';
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

        for (let [team, count] of currentEntry.ownership.entries()) {
            parentEntry?.subtractTeamCount(team, count);
        }

        tree.chilren.forEach((child) => {
            queue.enqueue({
                tree: child,
                parentEntry: currentEntry,
            });
        });
    }

    const newCodeowners = entries
        .sort((a, b) => (a.path < b.path ? -1 : 1))
        .map((entry) => entry.toString())
        .join('');

    console.log(`Saving to ${outputPath}`);
    await fs.writeFile(outputPath, newCodeowners);
}

main(process.argv[2]);
