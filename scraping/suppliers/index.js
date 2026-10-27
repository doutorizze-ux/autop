const { safeString } = require('./shared');
const comdip = require('./comdip');
const kki = require('./kki');
const kaizen = require('./kaizen');
const rmp = require('./rmp');
const sav = require('./sav');
const sky = require('./sky');
const dpk = require('./dpk');
const rolemar = require('./rolemar');
const vespor = require('./vespor');

const suppliers = [comdip, kki, kaizen, rmp, sav, sky, dpk, rolemar, vespor];

function buildSupplierHaystack(supplierInput) {
    if (typeof supplierInput === 'string') {
        return safeString(supplierInput).toLowerCase();
    }

    const values = [
        supplierInput?.name,
        supplierInput?.url,
        supplierInput?.loginUrl,
        supplierInput?.searchUrl,
    ];

    return values
        .map((value) => safeString(value).toLowerCase())
        .filter(Boolean)
        .join(' ');
}

function resolveStrategy(supplierInput) {
    const haystack = buildSupplierHaystack(supplierInput);
    return suppliers.find((strategy) => strategy.matches(haystack)) || { key: 'generic' };
}

module.exports = {
    resolveStrategy,
};
