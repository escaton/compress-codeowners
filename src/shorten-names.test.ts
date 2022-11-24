import { shortenNames } from './shorten-names';

describe('shorten-names', () => {
    it('should shorten given names', () => {
        expect([...shortenNames(['aaaaa', 'bbbbb', 'cc', 'aaaax'])]).toEqual([
            ['aaaaa', 'a*'],
            ['bbbbb', 'b*'],
            ['cc', 'cc'],
            ['aaaax', 'a*x'],
        ]);

        expect([...shortenNames(['aaaaa', 'aaaax', 'aaaax'])]).toEqual([
            ['aaaax', 'a*'],
            ['aaaaa', 'a*a'],
        ]);

        expect([...shortenNames(['aaabx', 'aaaax', 'aaaax', 'axaax'])]).toEqual(
            [
                ['aaaax', 'a*'],
                ['aaabx', 'a*bx'],
                ['axaax', 'ax*'],
            ]
        );

        expect([...shortenNames(['aaab'], ['aaaa'])]).toEqual([
            ['aaaa', 'aaaa'],
            ['aaab', 'a*b'],
        ]);

        expect([...shortenNames(['aaa'], ['aaaa'])]).toEqual([
            ['aaaa', 'aaaa'],
            ['aaa', 'aaa'],
        ]);

        expect([...shortenNames(['aaa'], ['aaa'])]).toEqual([
            ['aaa', 'a*'],
        ]);
    });
});
