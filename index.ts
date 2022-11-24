import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { diffAll, diffSpecificFile } from './src/calc-diff';
import { main } from './src/create-codeowners';
import { getFiles } from './src/getFiles';
import { readFilesFromStdin } from './src/read-files';

yargs(hideBin(process.argv))
    .usage('Usage: yarn strart [command]')
    .command(
        'compress <input> <output>',
        'compress CODEOWNERS file',
        (tune) => {
            return tune
                .positional('input', {
                    describe: 'input file',
                    type: 'string',
                })
                .positional('output', {
                    describe: 'output file',
                    type: 'string',
                })
                .option('lossy1', {
                    alias: 'l1',
                    describe: 'drop ownership if count > maxCount * ARG',
                    default: 0.8,
                    type: 'number',
                })
                .option('lossy2', {
                    alias: 'l2',
                    describe: 'drop ownership if count >= (sum - count) * ARG',
                    default: 0.5,
                    type: 'number',
                })
                .option('useGlobs', {
                    alias: 'g',
                    describe: 'makes ureadable but extremely compressed output',
                    default: false,
                    type: 'boolean',
                })
                .option('budget', {
                    alias: 'b',
                    describe: 'max CODEOWNERS size',
                    default: 100000,
                    type: 'number',
                });
        },
        async (argv) => {
            const files = await readFilesFromStdin();
            main({
                inputPath: argv.input!,
                outputPath: argv.output!,
                lossy1: argv.lossy1,
                lossy2: argv.lossy2,
                budget: argv.budget,
                useGlobs: argv.useGlobs,
                files,
            });
        }
    )
    .command(
        'diff <original> <test> [path]',
        'Calc difference between two CODEOWNERS',
        (tune) => {
            return tune
                .positional('original', {
                    describe: 'origianal file',
                    type: 'string',
                })
                .positional('test', {
                    describe: 'test file',
                    type: 'string',
                })
                .positional('path', {
                    describe: 'show diff for specific file',
                    type: 'string',
                })
                .option('team', {
                    alias: 't',
                    describe: 'show diff for specific team',
                    type: 'string',
                })
                .check((argv) => {
                    if (argv.team?.match(/^(#|@)/)) {
                        console.log(argv.team?.match(/^(#|@)/));
                        throw new Error(
                            'Argument team: use team name without # or @'
                        );
                    }
                    return true;
                });
        },
        async (argv) => {
            if (argv.path) {
                diffSpecificFile({
                    originalCodeownersPath: argv.original!,
                    testCodeownersPath: argv.test!,
                    specificFile: argv.path,
                });
            } else {
                const files = await readFilesFromStdin();
                diffAll({
                    originalCodeownersPath: argv.original!,
                    testCodeownersPath: argv.test!,
                    files,
                    forTeam: argv.team,
                });
            }
        }
    )
    .command(
        'generate-files <matchers..>',
        'generate list of files whose ownership is going to be optimized',
        (tune) => {
            return tune
                .positional('matchers', {
                    array: true,
                    type: 'string',
                })
                .option('cwd', {
                    default: '.',
                    alias: 'c',
                    describe: 'cwd for matching files',
                    type: 'string',
                });
        },
        async ({ matchers, cwd }) => {
            const files = await getFiles(matchers!, cwd);
            console.log(`# ${files.length} files`);
            console.log(`# cwd: ${cwd}`);
            console.log(`# matchers:`);
            matchers!.forEach((matcher) => console.log(`#    ${matcher}`));
            files.forEach((file) => console.log(file));
            // print to stderr not to corrupt stdout content
            console.error(`Done, matched ${files.length} files.`);
        }
    )
    .strict()
    .demandCommand()
    .version(false)
    .parse();
