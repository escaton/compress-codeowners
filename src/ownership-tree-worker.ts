import {
    parse as parseCodeowners,
    find as findInCodeowners,
} from './lint-codeowners';

import { parentPort as _parentPort, workerData } from 'worker_threads';

if (!_parentPort) {
    throw new Error('Non worker environment');
}
const parentPort = _parentPort!

const codeowners = parseCodeowners(workerData.codeownersString);

parentPort.on('message', (files) => {
    codeowners.files = files;
    const { owned } = findInCodeowners(codeowners);
    parentPort.postMessage(owned);
});
