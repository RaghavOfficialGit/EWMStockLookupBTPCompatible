const cds = require('@sap/cds');
const { executeHttpRequest } = require('@sap-cloud-sdk/http-client');
const { getDestination } = require('@sap-cloud-sdk/connectivity');

// SAP EWM API endpoint path
const EWM_API_PATH = '/sap/opu/odata4/sap/api_whse_physstockprod/srvd_a2x/sap/whsephysicalstockproducts/0001/WarehousePhysicalStockProducts';

// Destination name configured in BTP
const DESTINATION_NAME = 'EWM_HMF';

/**
 * Build OData $filter string from query parameters
 * Only includes non-null/non-empty fields
 */
function buildFilterExpression(filters) {
    const conditions = [];
    const fields = ['Product', 'EWMStockType', 'Batch', 'HandlingUnitNumber', 'EWMStorageBin'];
    
    fields.forEach(field => {
        if (filters[field]) {
            const escaped = String(filters[field]).replace(/'/g, "''");
            conditions.push(`${field} eq '${escaped}'`);
        }
    });
    
    return conditions.join(' and ');
}

/**
 * Extract filter values from CDS query
 */
function extractFilters(query) {
    const filters = {};
    if (query.SELECT && query.SELECT.where) {
        const where = query.SELECT.where;
        for (let i = 0; i < where.length; i++) {
            if (where[i].ref && where[i + 1] === '=' && where[i + 2]) {
                filters[where[i].ref[0]] = where[i + 2].val;
                i += 2;
            }
        }
    }
    return filters;
}

module.exports = cds.service.impl(async function() {
    const { WarehousePhysicalStock } = this.entities;

    this.on('READ', WarehousePhysicalStock, async (req) => {
        try {
            console.log('[StockService] Processing READ request');
            
            // Extract pagination parameters
            const top = req.query.SELECT?.limit?.rows?.val || 100;
            const skip = req.query.SELECT?.limit?.offset?.val || 0;
            
            // Extract and build filters
            const filters = extractFilters(req.query);
            const filterExpr = buildFilterExpression(filters);
            console.log('[StockService] Filter:', filterExpr);

            // Build query parameters
            const queryParams = {
                '$count': 'true',
                '$top': String(top),
                '$skip': String(skip)
            };
            if (filterExpr) {
                queryParams['$filter'] = filterExpr;
            }

            // Get destination from BTP
            console.log('[StockService] Resolving destination:', DESTINATION_NAME);
            const destination = await getDestination({ destinationName: DESTINATION_NAME });
            
            if (!destination) {
                console.error('[StockService] Destination not found');
                return req.error(502, `Destination '${DESTINATION_NAME}' not found`);
            }

            // Build query string
            const queryString = Object.entries(queryParams)
                .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
                .join('&');

            const fullPath = `${EWM_API_PATH}?${queryString}`;
            console.log('[StockService] Calling API:', fullPath);

            // Execute HTTP request to SAP EWM API
            const response = await executeHttpRequest(destination, {
                method: 'GET',
                url: fullPath,
                headers: {
                    'Accept': 'application/json'
                }
            });

            console.log('[StockService] Response status:', response.status);

            if (response.status === 200 && response.data) {
                const data = response.data.value || [];
                const totalCount = response.data['@odata.count'] || 0;
                
                console.log('[StockService] Records:', data.length, 'Total:', totalCount);

                // Transform data to match our entity structure
                const result = data.map((item, idx) => ({
                    ID: `${item.Product}_${item.EWMWarehouse}_${item.EWMStorageBin}_${skip + idx}`,
                    Product: item.Product || '',
                    EWMWarehouse: item.EWMWarehouse || '',
                    EWMStockType: item.EWMStockType || '',
                    Batch: item.Batch || '',
                    HandlingUnitNumber: item.HandlingUnitNumber || '',
                    EWMStorageBin: item.EWMStorageBin || '',
                    EWMStockQuantityInBaseUnit: parseFloat(item.EWMStockQuantityInBaseUnit) || 0,
                    EWMStockQuantityBaseUnit: item.EWMStockQuantityBaseUnit || ''
                }));

                // Set $count for OData response
                result.$count = totalCount;
                return result;
            }
            
            return req.error(502, 'Unexpected API response');
            
        } catch (error) {
            console.error('[StockService] Error:', error.message);
            
            if (error.response) {
                const status = error.response.status;
                if (status === 401 || status === 403) {
                    return req.error(401, 'Authentication failed. Check destination credentials.');
                } else if (status === 404) {
                    return req.error(404, 'API endpoint not found.');
                }
                return req.error(status, `API Error: ${error.message}`);
            }
            
            return req.error(500, `Internal error: ${error.message}`);
        }
    });
});
