import { crc32 } from 'crc';
import fs from 'fs/promises';
import path from 'path';
import globToTree, { ITree } from 'glob-tree-list';
import ProgressBar from 'progress';

import {
    parse as parseCodeowners,
    find as findInCodeowners,
} from '../../client/scripts/lint-codeowners';

export class OwnershipTree {
    size: number = 1;
    chilren: OwnershipTree[] = [];
    ownership: Map<string, [filesOwned: number, key: string]> = new Map();
    constructor(public path: string) {}
    addChild(name: string) {
        const child = new OwnershipTree(this.path + name);
        this.chilren.push(child);
        return child;
    }
    setOwnership(owners: { [key: string]: any }) {
        const teams = Object.keys(owners).map(
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
        return !(
            this.ownership.size === 1 &&
            this.ownership.has('none')
        );
    }
    calcOwnership() {
        this.size = this.chilren.reduce((acc, child) => (acc += child.size), 0);
        this.chilren.forEach((child) => {
            for (let [team, [count, key]] of child.ownership) {
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
        if (this.chilren.length) {
            const child = this.chilren.find((child) => {
                return path.startsWith(child.path);
            });
            if (child) {
                return child.getFileOwnership(path);
            }
        }
        console.log(this.chilren.map((child) => child.path));
        throw new Error(`unknown path ${path} at ${this.path}`);
    }
    toJSON(): unknown {
        return {
            size: this.size,
            path: this.path,
            ownership: Array.from(this.ownership.entries()),
            chilren: this.chilren.map((child) => child.toJSON()),
        };
    }
    static fromJSON(treeData: OwnershipTree) {
        const tree = new OwnershipTree(treeData.path);
        tree.size = treeData.size;
        tree.ownership = new Map(treeData.ownership);
        tree.chilren = treeData.chilren.map((childData) => {
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
        files.sort().join('') + codeownersString + 'version4'
    ).toString(16);
    const fileName = path.resolve(
        __dirname,
        '..',
        '.cache',
        `raw-ownership-${cacheKey}.json`
    );
    try {
        if (!cache) throw new Error("Don't use cache");
        const cacheFile = await fs.readFile(fileName, { encoding: 'utf8' });
        try {
            const tree = OwnershipTree.fromJSON(JSON.parse(cacheFile));
            console.log(`Use data from ${fileName}`);
            return tree;
        } catch (e) {
            console.error(e);
            throw e;
        }
    } catch {
        const codeowners = parseCodeowners(codeownersString);

        console.log('Matching files ownership...');

        const progressBar = new ProgressBar('[:bar] :file', {
            total: files.length - 1,
            width: 80,
            complete: '█',
            incomplete: '_',
            clear: true,
        });

        const buildOwnershipTree = (globTree: ITree, tree: OwnershipTree) => {
            Object.keys(globTree).forEach((leaf) => {
                if (
                    typeof globTree[leaf] === 'object' &&
                    globTree[leaf] !== null
                ) {
                    const folderNode = tree.addChild(leaf);
                    buildOwnershipTree(globTree[leaf] as ITree, folderNode);
                    folderNode.calcOwnership();
                }
                if (typeof globTree[leaf] === 'string') {
                    const fileNode = tree.addChild(leaf);
                    codeowners.files = [fileNode.path];
                    const { owners } = findInCodeowners(codeowners);
                    fileNode.setOwnership(owners);
                    progressBar.tick({ file: leaf });
                }
            });
        };

        const root = new OwnershipTree('/');
        buildOwnershipTree(globToTree(files), root);
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
