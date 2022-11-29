import fs from 'fs/promises';
import { PriorityQueue } from '@datastructures-js/priority-queue';
import ProgressBar from 'progress';

import { OwnershipTree, getOwnershipTree } from './ownership-tree';
import { shortenNames } from './shorten-names';

class Entry {
    private initialOwnership: Map<string, [count: number, key: string]>;
    fullOwnership: Map<string, [count: number, key: string]>;
    lossyOwnership: Map<string, [count: number, key: string]>;
    visibleOwnership: string[];
    children: Entry[] = [];
    position: number = -1;

    private namesMap: Map<string, string> = new Map();
    private pathSegments: string[];
    private debugMessages: string[] = [];
    constructor(
        public tree: OwnershipTree,
        private parentEntry: Entry | undefined,
        private options: {
            lossy1: number;
            lossy2: number;
            useGlobs: boolean;
        }
    ) {
        this.pathSegments = tree.path === '/' ? [''] : tree.path.split('/');
        this.initialOwnership = new Map(tree.ownership);
        this.fullOwnership = this.initialOwnership;
        this.lossyOwnership = this.initialOwnership;
        this.visibleOwnership = this.calcVisibleOwnership();

        if (parentEntry) {
            parentEntry.addChild(this);
        }
    }

    addChild(entry: Entry) {
        this.children.push(entry);

        this.updateNamesMap();
    }

    removeChild(entry: Entry) {
        this.children = this.children.filter((child) => child !== entry);

        this.updateNamesMap();
    }

    private updateNamesMap() {
        if (!this.options.useGlobs) {
            return;
        }

        const addedChildrenNames = this.children.map(
            (child) => child.tree.name
        );

        let treeToUnwrap = this.tree;
        while (treeToUnwrap.children.length === 1) {
            // skip single directories
            treeToUnwrap = treeToUnwrap.children[0];
        }

        const allChildrenNames = treeToUnwrap.children.map(
            (child) => child.name
        );
        this.namesMap = shortenNames(addedChildrenNames, allChildrenNames);
    }

    hasVaryOwnership() {
        const uniqKeys = new Set(
            [...this.fullOwnership.values()]
                .filter(([count]) => count > 0)
                .map(([, key]) => key)
        );
        return uniqKeys.size > 1;
    }

    downToTopUpdate() {
        this.debugMessages = [];
        this.fullOwnership = new Map();
        for (const [team, [count, key]] of this.initialOwnership) {
            this.fullOwnership.set(team, [count, key]);
        }

        const visibleChildrenSets = new Map<string, number>();

        this.children.forEach((child) => {
            child.downToTopUpdate();
            for (const [team, [count]] of child.initialOwnership) {
                if (team === 'none' && child.visibleOwnership.length === 0) {
                    continue;
                }
                this.fullOwnership.get(team)![0] -= count;
            }

            if (child.visibleOwnership.length > 0) {
                const key = child.visibleOwnership.join(' ');
                const existingCount = visibleChildrenSets.get(key);
                visibleChildrenSets.set(key, (existingCount || 0) + 1);
            }
        });

        this.lossyOwnership = this.calcLossyOwnership();
        this.visibleOwnership = this.calcVisibleOwnership();
        if (this.visibleOwnership.length === 0) {
            this.debugMessages.push(`Skip: no ownership to display`);
        }

        if (this.lossyOwnership.size === 0) {
            const [topChildSet] = [...visibleChildrenSets].sort(
                ([, a], [, b]) => b - a
            );
            if (topChildSet) {
                this.visibleOwnership = topChildSet[0].split(' ');
                this.debugMessages.push(
                    `Force visible ownership for most frequent children: ${topChildSet[0]}`
                );
            }
        }
    }

    topToDownUpdate() {
        if (this.visibleOwnership.length > 0) {
            let visibleParent = this.parentEntry;
            while (visibleParent) {
                if (visibleParent.visibleOwnership.length > 0) {
                    break;
                }
                visibleParent = visibleParent.parentEntry;
            }
            if (visibleParent) {
                if (
                    this.visibleOwnership.join(' ') ===
                    visibleParent.visibleOwnership.join(' ')
                ) {
                    this.debugMessages.push(
                        `Skip: same ownership as ${visibleParent.tree.path}`
                    );
                    this.visibleOwnership = [];
                }
            }
        }

        if (this.parentEntry) {
            const parentSegments = this.parentEntry.pathSegments;
            const namesMap = this.parentEntry.namesMap;
            this.pathSegments = this.pathSegments.map((segment, i) => {
                if (parentSegments[i] !== undefined) {
                    return parentSegments[i];
                }
                if (i < this.pathSegments.length - 1) {
                    return '*';
                }
                return namesMap.get(segment) ?? segment;
            });
        }

        this.children.forEach((child) => child.topToDownUpdate());
    }


    calcLossyOwnership() {
        let sum = 0;
        let maxCount = 0;
        const uniqKeys = new Set<string>();

        let filteredOwnership = [];
        for (const [team, [count, key]] of this.fullOwnership) {
            if (count > maxCount) {
                maxCount = count;
            }
            sum += count;
            if (count > 0) {
                filteredOwnership.push([team, [count, key]] as [string, [number, string]]);
                uniqKeys.add(key);
            }
        }

        if (uniqKeys.size === 1) {
            return new Map(filteredOwnership);
        }

        filteredOwnership = [...this.fullOwnership].filter(
            ([, [count]]) =>
                // TODO find examples where this could be usefull
                count > maxCount * this.options.lossy1 &&
                // count > 0 &&
                count >= (sum - count) * this.options.lossy2
        );
        return new Map(filteredOwnership);
    }

    calcVisibleOwnership() {
        return [...this.lossyOwnership]
            .filter(([team]) => team !== 'none')
            .map(([team]) => team);
    }

    toString(debug: boolean = false) {
        let result = '';
        const teams = this.visibleOwnership.map((team) => '#' + team);
        if (teams.length > 0) {
            result = [
                `path:`,
                this.printPath,
                this.tree.isFile ? '' : '/*',
                ' ',
                teams.join(' '),
                '\n',
            ].join('');
        }
        if (debug) {
            result = [
                `# position: ${this.position}`,
                `# ownership:`,
                ...[...this.initialOwnership.entries()]
                    .sort((a, b) => b[1][0] - a[1][0])
                    .map(([team, [count]]) => {
                        const ownedCount = this.fullOwnership.get(team)![0];
                        const narrowed = ownedCount === 0;
                        const lossy =
                            !this.lossyOwnership.has(team) && !narrowed;
                        return `#    ${[
                            narrowed ? 'narrowed' : '        ',
                            lossy ? 'lossy' : '     ',
                            `${ownedCount}/${count}`.padEnd(10),
                            team,
                        ].join(' ')}`;
                    }),
                ...this.debugMessages.map((message) => `# ${message}`),
                `# ${this.tree.path}`,
                result,
                '',
            ].join('\n');
        }
        return result;
    }
    get printPath(): string {
        return this.pathSegments.join('/');
    }
    get size(): number {
        return this.toString().length;
    }
}

export async function main({
    inputPath,
    outputPath,
    lossy1,
    lossy2,
    budget: MAX_BUDGET,
    useGlobs,
    files,
}: {
    inputPath: string;
    outputPath: string;
    lossy1: number;
    lossy2: number;
    budget: number;
    useGlobs: boolean;
    files: string[];
}) {
    console.log('Searching files...');

    console.log(`Found ${files.length} files`);

    const root = await getOwnershipTree(
        files,
        await fs.readFile(inputPath, { encoding: 'utf8' }),
        true
    );

    let lastBudget = 0;
    const entries: Entry[] = [];
    const getBudget = (entries: Entry[]) => {
        return entries.reduce((acc, entry) => acc + entry.size, 0);
    };
    const modifyEntries = (cb: () => void, rollback: () => void) => {
        cb();
        entries[0].downToTopUpdate();
        entries[0].topToDownUpdate();
        const budget = getBudget(entries);
        if (budget > MAX_BUDGET) {
            rollback();
            entries[0].downToTopUpdate();
            entries[0].topToDownUpdate();
        }
        lastBudget = budget;
    };

    const queue = new PriorityQueue<{
        tree: OwnershipTree;
        parentEntry?: Entry;
    }>((a, b) => {
        return b.tree.size - a.tree.size;
    });

    queue.push({ tree: root });

    const progress = new ProgressBar('[:bar] queue size: :queue_size', {
        total: MAX_BUDGET,
        width: 80,
        complete: '█',
        incomplete: '_',
        clear: true,
    });
    while (queue.size() > 0) {
        const { tree, parentEntry } = queue.pop();
        const currentEntry = new Entry(tree, parentEntry, {
            lossy1,
            lossy2,
            useGlobs,
        });

        modifyEntries(
            () => (currentEntry.position = entries.push(currentEntry)),
            () => parentEntry?.removeChild(entries.pop()!)
        );

        progress.update(Math.min(lastBudget / MAX_BUDGET, 0.999));
        progress.tick({ queue_size: queue.size() });

        if (currentEntry.hasVaryOwnership()) {
            // we are sure there will be more then one file
            let treeToUnwrap = tree;
            while (treeToUnwrap.children.length === 1) {
                // skip single directories
                treeToUnwrap = treeToUnwrap.children[0];
            }
            treeToUnwrap.children.forEach((child) => {
                if (child.hasOwnership()) {
                    queue.push({
                        tree: child,
                        parentEntry: currentEntry,
                    });
                }
            });
        }
    }

    progress.terminate();

    const newCodeowners = entries
        .sort((a, b) => (a.printPath < b.printPath ? -1 : 1))
        .map((entry) => entry.toString(Boolean(process.env.DEBUG)))
        .join('');

    console.log(`Saving to ${outputPath}`);
    await fs.writeFile(outputPath, newCodeowners);
}
