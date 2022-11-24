import { crc32 } from 'crc';
import fs from 'fs/promises';
import path from 'path';
import globToTree, { ITree } from 'glob-tree-list';
import ProgressBar from 'progress';
import { StaticPool } from 'node-worker-threads-pool';
import os from 'os';

export class OwnershipTree {
    size: number = 1;
    children: OwnershipTree[] = [];
    ownership: Map<string, [filesOwned: number, key: string]> = new Map();
    isFile: boolean = false;
    maxOwnership:
        | [team: string, value: [count: number, key: string]]
        | undefined;
    constructor(public path: string, public name: string) {}
    addChild(name: string, isFile: boolean) {
        if (!isFile) {
            name = name.replace(/\/$/, '');
        }
        const childPath =
            this.path === '/' ? this.path + name : this.path + '/' + name;
        const child = new OwnershipTree(childPath, name);
        child.isFile = isFile;
        this.children.push(child);
        this.children.sort((a, b) => b.path.length - a.path.length);
        return child;
    }
    setOwnership(owners: string[]) {
        const teams = owners.map(
            (team) =>
                [team.replace(/(@@|@|#)/, ''), [1, this.path]] as [
                    string,
                    [number, string]
                ]
        );
        this.ownership = new Map(
            teams.length > 0 ? teams : [['none', [1, this.path]]]
        );
    }
    hasOwnership() {
        return !(this.ownership.size === 1 && this.ownership.has('none'));
    }
    calcOwnership() {
        this.size = this.children.reduce(
            (acc, child) => (acc += child.size),
            0
        );
        this.maxOwnership = Array.from(this.ownership)
            .filter(([team]) => team !== 'none')
            .sort(([, [a]], [, [b]]) => a - b)
            .pop();
        this.children.forEach((child) => {
            for (const [team, [count, key]] of child.ownership) {
                const [prevCount, prevKey] = this.ownership.get(team) || [
                    0,
                    '',
                ];
                this.ownership.set(team, [prevCount + count, prevKey + key]);
            }
        });
    }
    getFileOwnership(
        path: string
    ): [team: string, value: [count: number, key: string]][] {
        if (path === this.path) {
            if (!this.ownership.entries) {
                console.log(this.ownership);
            }
            return Array.from(this.ownership.entries());
        }
        if (this.children.length) {
            const child = this.children.find((child) => {
                return path.startsWith(child.path);
            });
            if (child) {
                return child.getFileOwnership(path);
            }
        }
        console.log(this.children.map((child) => child.path));
        throw new Error(`unknown path ${path} at ${this.path}`);
    }
    toJSON(): unknown {
        return {
            size: this.size,
            path: this.path,
            name: this.name,
            ownership: Array.from(this.ownership.entries()),
            maxOwnership: this.maxOwnership,
            isFile: this.isFile,
            children: this.children.map((child) => child.toJSON()),
        };
    }
    static fromJSON(treeData: OwnershipTree) {
        const tree = new OwnershipTree(treeData.path, treeData.name);
        tree.size = treeData.size;
        tree.ownership = new Map(treeData.ownership);
        tree.maxOwnership = treeData.maxOwnership;
        tree.isFile = treeData.isFile;
        tree.children = treeData.children.map((childData) => {
            return OwnershipTree.fromJSON(childData);
        });
        return tree;
    }
}

export const getOwnershipTree = async (
    files: string[],
    codeownersString: string,
    cache: boolean
): Promise<OwnershipTree> => {
    const cacheKey = crc32(
        files.sort().join('') + codeownersString + 'version 11'
    ).toString(16);
    const fileName = path.resolve(
        os.tmpdir(),
        'compress-codeowners',
        `raw-ownership-${cacheKey}.json`
    );
    try {
        if (!cache) throw new Error("Don't use cache");
        const cacheFile = await fs.readFile(fileName, { encoding: 'utf8' });
        try {
            const tree = OwnershipTree.fromJSON(JSON.parse(cacheFile));
            return tree;
        } catch (e) {
            console.error(e);
            throw e;
        }
    } catch {
        console.log('Matching files ownership...');

        const filesOwners: Record<string, string[]> = {}

        const workersCount = os.cpus().length - 1;
        const staticPool = new StaticPool({
            size: workersCount,
            task: __dirname + '/ownership-tree-worker-boot.js',
            workerData: { codeownersString },
        });

        const chunkSize = Math.ceil(files.length / workersCount);
        await Promise.all(
            Array(os.cpus().length - 1)
                .fill(0)
                .map((_, index) => {
                    const chunk = files.slice(
                        index * chunkSize,
                        index * chunkSize + chunkSize
                    );
                    return staticPool.exec(chunk).then((owned: Record<string, string[]>) => {
                        Object.assign(filesOwners, owned)
                    });
                })
        );

        const buildOwnershipTree = (globTree: ITree, tree: OwnershipTree) => {
            return Promise.all(
                Object.keys(globTree).map((leaf) => {
                    if (
                        typeof globTree[leaf] === 'object' &&
                        globTree[leaf] !== null
                    ) {
                        const folderNode = tree.addChild(leaf, false);
                        buildOwnershipTree(globTree[leaf] as ITree, folderNode);
                        folderNode.calcOwnership();
                    }
                    if (typeof globTree[leaf] === 'string') {
                        const fileNode = tree.addChild(leaf, true);
                        fileNode.setOwnership(filesOwners[fileNode.path] || [])
                    }
                })
            );
        };

        const root = new OwnershipTree('/', '/');
        await buildOwnershipTree(globToTree(files), root);
        staticPool.destroy();
        root.calcOwnership();

        console.log('Ownership matched');

        if (cache) {
            await fs.mkdir(path.dirname(fileName), { recursive: true });
            await fs.writeFile(
                fileName,
                JSON.stringify(root.toJSON(), null, 2)
            );
        }

        return root;
    }
};
