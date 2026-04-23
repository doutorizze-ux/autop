function safeString(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim();
}

function buildSelectorList(...values) {
    return values
        .flatMap((value) => (Array.isArray(value) ? value : [value]))
        .map((value) => safeString(value))
        .filter(Boolean);
}

module.exports = {
    safeString,
    buildSelectorList,
};
