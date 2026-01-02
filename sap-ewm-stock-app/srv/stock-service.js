const cds = require('@sap/cds');
const { executeHttpRequest } = require('@sap-cloud-sdk/http-client');
const { getDestination } = require('@sap-cloud-sdk/connectivity');

// SAP EWM API endpoint path
const EWM_API_PATH = '/sap/opu/odata4/sap/api_whse_physstockprod/srvd_a2x/sap/whsephysicalstockproducts/0001/WarehousePhysicalStockProducts';

// BTP Destination name
const DESTINATION_NAME = 'HMF_2023_HTTPS';

/**
 * Get allowed stock types from user's JWT token attributes
 * @param {object} req - CDS request object
 * @returns {string[]} Array of allowed stock types
 */
function getAllowedStockTypes(req) {
    const user = req.user;
    
    if (!user) {
        console.log('[StockService] No user context - denying access');
        return [];
    }
    
    // Get stock types from user attributes (from XSUAA JWT token)
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
        if (allowedStockTypes.includes(filters.EWMStockType)) {
            conditions.push(`EWMStockType eq '${filters.EWMStockType}'`);
        } else {
            console.log('[StockService] Access denied to stock type:', filters.EWMStockType);
            return null;
        }
    } else if (allowedStockTypes.length > 0) {
        const stockTypeConditions = allowedStockTypes
            .map(st => `EWMStockType eq '${st}'`)
            .join(' or ');
        conditions.push(`(${stockTypeConditions})`);
    } else {
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

        // Build query parameters
        const queryParams = new URLSearchParams({
            '$count': 'true',
            '$top': String(top),
            '$skip': String(skip)
        });
        
        if (filter) {
            queryParams.append('$filter', filter);
        }

        const fullUrl = `${EWM_API_PATH}?${queryParams.toString()}`;
        console.log('[StockService] Calling API:', fullUrl);

        try {
            // Get destination using SAP Cloud SDK
            console.log('[StockService] Resolving destination:', DESTINATION_NAME);
            const destination = await getDestination({ destinationName: DESTINATION_NAME });
            
            if (!destination) {
                console.error('[StockService] Destination not found:', DESTINATION_NAME);
                req.error(502, `Destination '${DESTINATION_NAME}' not found or not accessible`);
                return;
            }
            
            console.log('[StockService] Destination resolved successfully');

            // Execute HTTP request using SAP Cloud SDK
            const response = await executeHttpRequest(destination, {
                method: 'GET',
                url: fullUrl,
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

            console.log('[StockService] API response status:', response.status);

            if (response.status === 200 && response.data) {
                const data = response.data.value || [];
                const totalCount = response.data['@odata.count'] || data.length;
                
                console.log('[StockService] Records:', data.length, 'Total:', totalCount);

                const result = data.map((item, i) => ({
                    ID: `${item.Product}_${item.EWMWarehouse}_${item.EWMStorageBin}_${skip + i}`,
                    Product: item.Product || '',
                    EWMWarehouse: item.EWMWarehouse || '',
                    EWMStockType: item.EWMStockType || '',
                    Batch: item.Batch || '',
                    HandlingUnitNumber: item.HandlingUnitNumber || '',
                    EWMStorageBin: item.EWMStorageBin || '',
                    EWMStockQuantityInBaseUnit: parseFloat(item.EWMStockQuantityInBaseUnit) || 0,
                    EWMStockQuantityBaseUnit: item.EWMStockQuantityBaseUnit || ''
                }));
                
                result.$count = totalCount;
                console.log('[StockService] Returning', result.length, 'records');
                return result;
            }
            
            req.error(502, 'Unexpected API response');
            
        } catch (error) {
            console.error('[StockService] Error:', error.message);
            
            if (error.response) {
                const status = error.response.status;
                const message = error.response.data?.error?.message?.value || error.message;
                
                if (status === 401 || status === 403) {
                    req.error(401, 'Authentication failed. Check destination credentials.');
                } else if (status === 404) {
                    req.error(404, 'API endpoint not found.');
                } else {
                    req.error(status, `SAP API Error: ${message}`);
                }
            } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
                req.error(503, 'Unable to connect to SAP system. Check destination configuration.');
            } else {
                req.error(500, `Internal error: ${error.message}`);
            }
        }
    });
});
