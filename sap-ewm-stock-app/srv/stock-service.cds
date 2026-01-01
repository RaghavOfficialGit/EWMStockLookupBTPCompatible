using ewm.stock from '../db/schema';

@path: '/stock'
@requires: 'StockRead'
service StockService {
    @readonly
    @restrict: [{ grant: 'READ', to: 'StockRead' }]
    entity WarehousePhysicalStock as projection on stock.WarehousePhysicalStock;
}
