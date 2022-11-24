// @ts-check
const micromatch = require('micromatch');

/** @param {string[]} arr */
const cleanArray = (arr) => arr.map((m) => m.trim()).filter(Boolean);

class Team {
    /**
     * @param {string} value
     * @param {number} line
     */
    constructor(value, line) {
        const [name, ...members] = value.split(' ');

        // strip first '@' from team name
        this.name = name.substr(1);

        this.members = cleanArray(members);
        this.line = line;
    }
}

class CodePath {
    /**
     * @param {string} value
     * @param {number} line
     */
    constructor(value, line) {
        let [pattern, ...responsible] = value.split(' ');

        // Remove any trailing "**/*" from pattern.
        if (pattern.endsWith('**/*')) {
            pattern = pattern.substr(0, pattern.length - 4);
        }
        this.pattern = pattern;

        this.responsible = cleanArray(responsible);
        this.line = line;
    }
}

class ParseContext {
    /** @param {{
     *   teams: Team[],
     *   paths: CodePath[],
     *   files: string[],
     *   inputFile: string
     * }} [options] */
    constructor(options) {
        const { teams, paths, files, inputFile } = options || {};
        this.teams = teams || [];
        this.paths = paths || [];
        this.files = files || [];
        this.inputFile = inputFile || '';
    }

    /**
     * @param {string} content
     */
    parse(content) {
        content.split('\n').forEach((line, i) => {
            line = line.trim();

            if (!line.length) {
                // Skip empty lines.
                return;
            }

            const first = line[0];

            switch (first) {
                // Skip commented lines
                case '#':
                    return;

                case '@':
                    this.teams.push(new Team(line, i));
                    break;

                default:
                    this.paths.push(new CodePath(line, i));
                    break;
            }
        });
    }
}

/**
 * @param {string} content
 * @returns {ParseContext}
 */
function parse(content) {
    const ctx = new ParseContext();
    ctx.parse(content);
    return ctx;
}

/**
 * Add leading slash to signal paths are at the root of the git repo.
 * @param {string[]} paths
 */
function convertToRootPaths(paths) {
    return paths.map((path) => {
        if (path[0] === '/') {
            return path;
        }

        if (path.startsWith('./')) {
            return path.slice(1);
        }

        return '/' + path;
    });
}

/**
 * @param {string} pattern
 * @returns {(files: string[]) => string[]}
 */
function getMatcher(pattern) {
    const isGlob = pattern.includes('*');

    // 1) If the pattern contains glob stars, use micromatch.
    if (isGlob) {
        // If no slash is found in the pattern, allow matching all paths.
        //
        // For example:
        // 1) "*.ts" should match "/foo/bar.ts"
        // 2) "*bar*" should match "/dir/foobarbaz.ts"
        //
        // Without prepending "**/" to the pattern, those patterns will not match.
        if (!pattern.includes('/') && !pattern.startsWith('**')) {
            pattern = '**/' + pattern;
        }

        return (files) => micromatch(files, pattern, { matchBase: false });
    }

    // 2) Else, try fast string prefix matching.
    return (files) => {
        // By default, try to match any position in the filename.
        /** @param {string} file */
        let filter = (file) => file.includes(pattern);

        // But for absolute paths, try to match from the start.
        if (pattern.startsWith('/')) {
            filter = (file) => file.startsWith(pattern);
        }

        return files.filter(filter);
    };
}

/**
 * @param {string[]} path
 * @param {string} pattern
 * @returns string[]
 */
function match(path, pattern) {
    return getMatcher(pattern)(path);
}

class FindResults {
    constructor() {
        /** @type {Record<string, Set<string>>} */
        this.owners = {};
        /** @type {Record<string, string[]>} */
        this.owned = {};
    }

    /**
     * @param {string} owner
     * @param {string[]} files
     */
    add(owner, files) {
        const owned = this.owners[owner] || new Set();
        for (const file of files) {
            owned.add(file);
            this.owned[file] = [...(this.owned[file] || []), owner];
        }
        this.owners[owner] = owned;
    }

    /**
     * @param {string} file
     */
    remove(file) {
        for (const owner of this.owned[file] || []) {
            const files = this.owners[owner];
            if (!files) {
                continue;
            }

            files.delete(file);

            if (!files.size) {
                delete this.owners[owner];
            }
        }
        delete this.owned[file]
    }

    teams() {
        return Object.keys(this.owners);
    }
}

/**
 * @param {ParseContext} ctx
 * @returns {string[]}
 */
function prepareFindQuery(ctx) {
    return convertToRootPaths(ctx.files);
}

/**
 * @param {ParseContext} ctx
 * @returns {FindResults}
 */
function find(ctx) {
    const files = prepareFindQuery(ctx);

    const results = new FindResults();
    const matched = new Set();

    // For each code path.
    ctx.paths.forEach((path) => {
        const { pattern, responsible } = path;

        const found = match(files, pattern);
        if (!found.length) {
            // No matches found. Try next path.
            return;
        }

        // Path matched. First remove any previously match results.
        // This is the rule "last match wins".
        for (const file of found) {
            results.remove(file);
        }

        // Then, add the new results.
        for (const file of found) {
            matched.add(file);
        }

        for (const owner of responsible) {
            results.add(owner, found);
        }
    });

    return results;
}

module.exports = {
    parse,
    find,
};
