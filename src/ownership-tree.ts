import fs from 'fs/promises';
import globToTree, { ITree } from 'glob-tree-list';
import ProgressBar from 'progress';

import {
    parse as parseCodeowners,
    find as findInCodeowners,
} from '../../client/scripts/lint-codeowners';

export class OwnershipTree {
    size: number = 1;
    chilren: OwnershipTree[] = [];
    ownership: [team: string, filesOwned: number][] = [];
    constructor(public path: string) {}
    addChild(name: string) {
        const child = new OwnershipTree(this.path + name);
        this.chilren.push(child);
        return child;
    }
    setOwnership(owners: { [key: string]: any }) {
        const teams = Object.keys(owners).map(
            (team) => [team.replace('@@', '#'), 1] as [string, number]
        );
        this.ownership = teams.length > 0 ? teams : [['none', 1]];
    }
    calcOwnership() {
        this.size = this.chilren.reduce((acc, child) => (acc += child.size), 0);
        const map = new Map<string, number>();
        this.chilren.forEach((child) =>
            child.ownership.map(([team, size]) => {
                map.set(team, (map.get(team) || 0) + size);
            })
        );
        this.ownership = [...map.entries()];
    }
    toJSON(): unknown {
        return {
            size: this.size,
            path: this.path,
            ownership: this.ownership,
            chilren: this.chilren.map((child) => child.toJSON()),
        };
    }
    getFileOwnership(path: string): typeof this.ownership {
        if (path === this.path) {
            return this.ownership;
        }
        if (this.chilren.length) {
            return this.chilren
                .find((child) => {
                    return path.startsWith(child.path);
                })!
                .getFileOwnership(path);
        }
        throw new Error(`unknown path ${path} at ${this.path}`);
    }
    static fromJSON(treeData: OwnershipTree) {
        const tree = new OwnershipTree(treeData.path);
        tree.size = treeData.size;
        tree.ownership = treeData.ownership;
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
    const fileName = `./.raw-ownership-${files.length}.json`;
    try {
        if (!cache) throw new Error("Don't use cache");
        const tree = OwnershipTree.fromJSON(
            JSON.parse(await fs.readFile(fileName, { encoding: 'utf8' }))
        );
        console.log(`Use data from ${fileName}`);
        return tree;
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
            await fs.writeFile(
                fileName,
                JSON.stringify(root.toJSON(), null, 2)
            );
        }

        return root;
    }
};
