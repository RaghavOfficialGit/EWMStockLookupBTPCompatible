const cds = require('@sap/cds');

const EWM_API_PATH = '/sap/opu/odata4/sap/api_whse_physstockprod/srvd_a2x/sap/whsephysicalstockproducts/0001/WarehousePhysicalStockProducts';

/**
 * Get allowed stock types from user's JWT token attributes
 * @param {object} req - CDS request object
 * @returns {string[]} Array of allowed stock types
 */
function getAllowedStockTypes(req) {
    // Get StockType attribute from user's JWT token
    const user = req.user;
    
    if (!user) {
        console.log('[StockService] No user context - denying access');
        return [];
    }
    
    // Get stock types from user attributes
    // In XSUAA, attributes are available via user.attr
    const stockTypes = user.attr?.StockType || [];
    
    console.log('[StockService] User:', user.id);
    console.log('[StockService] Allowed stock types:', stockTypes);
    
    return Array.isArray(stockTypes) ? stockTypes : [stockTypes];
}

/**
 * Build OData $filter string from query parameters
 * Adds stock type restriction based on user authorization
 */
function buildFilter(filters, allowedStockTypes) {
    const conditions = [];
    
    // Add user-provided filters
    ['Product', 'Batch', 'HandlingUnitNumber', 'EWMStorageBin'].forEach(field => {
        if (filters[field]) {
            conditions.push(`${field} eq '${String(filters[field]).replace(/'/g, "''")}'`);
        }
    });
    
    // Handle EWMStockType filter with authorization check
    if (filters.EWMStockType) {
        // User requested specific stock type - verify they have access
        if (allowedStockTypes.includes(filters.EWMStockType)) {
            conditions.push(`EWMStockType eq '${filters.EWMStockType}'`);
        } else {
            // User requested stock type they don't have access to
            console.log('[StockService] Access denied to stock type:', filters.EWMStockType);
            return null; // Signal access denied
        }
    } else if (allowedStockTypes.length > 0) {
        // No stock type filter - restrict to allowed types
        const stockTypeConditions = allowedStockTypes
            .map(st => `EWMStockType eq '${st}'`)
            .join(' or ');
        conditions.push(`(${stockTypeConditions})`);
    } else {
        // No allowed stock types - deny access
        return null;
    }
    
    return conditions.join(' and ');
}

/**
 * Extract filter values from CDS query
 */
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

    // Enforce authorization on READ
    this.on('READ', WarehousePhysicalStock, async (req) => {
        // Get user's allowed stock types
        const allowedStockTypes = getAllowedStockTypes(req);
        
        if (allowedStockTypes.length === 0) {
            console.log('[StockService] User has no stock type access');
            req.error(403, 'Access denied. No stock type authorization.');
            return;
        }
        
        const top = req.query.SELECT?.limit?.rows?.val || 100;
        const skip = req.query.SELECT?.limit?.offset?.val || 0;
        const userFilters = parseFilters(req.query);
        
        // Build filter with authorization check
        const filter = buildFilter(userFilters, allowedStockTypes);
        
        if (filter === null) {
            console.log('[StockService] Access denied to requested stock type');
            req.error(403, 'Access denied. You are not authorized to view the requested stock type.');
            return;
        }

        let url = `${EWM_API_PATH}?$count=true&$top=${top}&$skip=${skip}`;
        if (filter) url += `&$filter=${encodeURIComponent(filter)}`;
        
        console.log('[StockService] API URL:', url);

        try {
            const res = await ewm.send({ 
                method: 'GET', 
                path: url, 
                headers: { Accept: 'application/json' } 
            });
            
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
            console.log('[StockService] Returning', result.length, 'records');
            return result;
            
        } catch (e) {
            console.error('[StockService] API Error:', e.message);
            req.error(e.code === 401 ? 401 : 500, e.message);
        }
    });
});
