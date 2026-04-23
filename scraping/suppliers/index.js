const { safeString } = require('./shared');
const comdip = require('./comdip');
const kaizen = require('./kaizen');
const rmp = require('./rmp');
const sav = require('./sav');
const sky = require('./sky');

const suppliers = [comdip, kaizen, rmp, sav, sky];

function resolveStrategy(supplierName) {
    const normalizedName = safeString(supplierName).toLowerCase();
    return suppliers.find((strategy) => strategy.matches(normalizedName)) || { key: 'generic' };
}

module.exports = {
    resolveStrategy,
};
