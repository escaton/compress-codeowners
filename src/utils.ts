export const mergeMaps = (maps: Map<string, number>[]) => {
    return maps.reduce((acc, map) => {
        for (let [key, val] of map) {
            const existingValue = acc.get(key);
            acc.set(key, (existingValue || 0) + val);
        }
        return acc;
    }, new Map<string, number>());
};
