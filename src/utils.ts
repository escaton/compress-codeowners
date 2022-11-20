export const mapsKeysAreSame = (
    map1: Map<string, any>,
    map2: Map<string, any>
): boolean => {
    if (map1.size !== map2.size) {
        return false;
    }
    for (let key of map1.keys()) {
        if (!map2.has(key)) {
            return false;
        }
    }
    return true;
};

export const mergeMaps = (maps: Map<string, number>[]) => {
    return maps.reduce((acc, map) => {
        for (let [key, val] of map) {
            const existingValue = acc.get(key);
            acc.set(key, (existingValue || 0) + val);
        }
        return acc;
    }, new Map<string, number>());
};

export const getTail = (
    entries: [name: string, value: [count: number, key: string]][],
    coef: number
): string[] => {
    const sorted = entries.slice().sort((a, b) => {
        return b[1][0] - a[1][0];
    });

    const res: string[] = [];

    while (
        sorted.length > 1 &&
        sorted[0][1][0] > sorted[sorted.length - 1][1][0] / coef
    ) {
        res.push(sorted.pop()![0]);
    }

    return res;
};
