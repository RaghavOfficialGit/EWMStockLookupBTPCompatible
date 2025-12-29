const cds = require('@sap/cds');

const EWM_API_PATH = '/sap/opu/odata4/sap/api_whse_physstockprod/srvd_a2x/sap/whsephysicalstockproducts/0001/WarehousePhysicalStockProducts';

function buildFilter(filters) {
    const conditions = [];
    ['Product', 'EWMStockType', 'Batch', 'HandlingUnitNumber', 'EWMStorageBin'].forEach(field => {
        if (filters[field]) {
            conditions.push(`${field} eq '${String(filters[field]).replace(/'/g, "''")}'`);
        }
    });
    return conditions.join(' and ');
}

function parseFilters(query) {
    const filters = {};
    const where = query.SELECT?.where;
    if (where) {
        for (let i = 0; i < where.length; i++) {
            if (where[i].ref && where[i+1] === '=' && where[i+2]?.val !== undefined) {
                filters[where[i].ref[0]] = where[i+2].val;
                i += 2;
            }
        }
    }
    return filters;
}

module.exports = cds.service.impl(async function() {
    const { WarehousePhysicalStock } = this.entities;
    const ewm = await cds.connect.to('EWM_HMF');

    this.on('READ', WarehousePhysicalStock, async (req) => {
        const top = req.query.SELECT?.limit?.rows?.val || 100;
        const skip = req.query.SELECT?.limit?.offset?.val || 0;
        const filter = buildFilter(parseFilters(req.query));

        let url = `${EWM_API_PATH}?$count=true&$top=${top}&$skip=${skip}`;
        if (filter) url += `&$filter=${encodeURIComponent(filter)}`;

        try {
            const res = await ewm.send({ method: 'GET', path: url, headers: { Accept: 'application/json' } });
            const data = res?.value || (Array.isArray(res) ? res : []);
            const result = data.map((item, i) => ({
                ID: `${item.Product}_${item.EWMWarehouse}_${skip + i}`,
                Product: item.Product || '',
                EWMWarehouse: item.EWMWarehouse || '',
                EWMStockType: item.EWMStockType || '',
                Batch: item.Batch || '',
                HandlingUnitNumber: item.HandlingUnitNumber || '',
                EWMStorageBin: item.EWMStorageBin || '',
                EWMStockQuantityInBaseUnit: parseFloat(item.EWMStockQuantityInBaseUnit) || 0,
                EWMStockQuantityBaseUnit: item.EWMStockQuantityBaseUnit || ''
            }));
            result.$count = res?.['@odata.count'] || data.length;
            return result;
        } catch (e) {
            console.error('EWM API Error:', e.message);
            req.error(e.code === 401 ? 401 : 500, e.message);
        }
    });
});
