export const shortenNames = (names: string[], preservedNames?: string[]) => {
    const frequency = new Map<string, { count: number }>();

    names.forEach((name) => {
        if (!frequency.has(name)) {
            frequency.set(name, {
                count: 0,
            });
        }
        frequency.get(name)!.count++;
    });

    const result = new Map<string, string>();
    if (preservedNames) {
        preservedNames.forEach((name) => result.set(name, name));
    }

    Array.from(frequency)
        .sort((a, b) => b[1].count - a[1].count)
        .forEach((entry) => {
            const name = [...entry[0]]; // fix unicode multibyte symbols
            let start = name.slice(0, 1);
            let end: string[] = [];
            while (
                `${start.join('')}*${end.join('')}`.length <
                name.join('').length
            ) {
                const same = [
                    ...([...result.keys()].find((processedName) => {
                        return (
                            processedName.startsWith(start.join('')) &&
                            processedName.endsWith(end.join('')) &&
                            processedName !== name.join('')
                        );
                    }) || ''),
                ];
                if (same.length > 0) {
                    let beginning = start.length;
                    while (
                        beginning < name.length &&
                        name[beginning] === same[beginning]
                    ) {
                        beginning++;
                    }
                    let ending = end.length;
                    while (
                        ending < name.length &&
                        name.at(-ending - 1) === same.at(-ending - 1)
                    ) {
                        ending++;
                    }
                    if (beginning <= ending) {
                        start = name.slice(0, beginning + 1);
                    } else {
                        end = name.slice(-ending - 1);
                    }
                } else {
                    result.set(
                        name.join(''),
                        `${start.join('')}*${end.join('')}`
                    );
                    return;
                }
            }
            result.set(name.join(''), name.join(''));
        });

    return result;
};
