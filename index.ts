import yargs from 'yargs';
import { diffAll, diffSpecificFile } from './src/calc-diff';
import { main } from './src/create-codeowners';

yargs(process.argv.slice(2))
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
                .option('budget', {
                    alias: 'b',
                    describe: 'max CODEOWNERS size',
                    default: 100000,
                    type: 'number',
                });
        },
        (argv) => {
            main({
                inputPath: argv.input!,
                outputPath: argv.output!,
                lossy1: argv.lossy1,
                lossy2: argv.lossy2,
                budget: argv.budget,
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
                        console.log(argv.team?.match(/^(#|@)/))
                        throw new Error(
                            'Argument team: use team name without # or @'
                        );
                    }
                    return true
                });
        },
        (argv) => {
            if (argv.path) {
                diffSpecificFile(argv.original!, argv.test!, argv.path);
            } else {
                diffAll(argv.original!, argv.test!, argv.team);
            }
        }
    )
    .strict()
    .demandCommand()
    .version(false)
    .parse();
