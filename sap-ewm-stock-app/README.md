# SAP EWM Warehouse Physical Stock Lookup

## Overview

This is a production-ready SAP BTP CAP application that allows users to search and view warehouse physical stock records from SAP Extended Warehouse Management (EWM) system.

### Key Features

- **Filter-based Search**: Search stock by Product, Stock Type, Batch, Handling Unit, and Storage Bin
- **Real-time Data**: Fetches live data from SAP EWM via standard OData API
- **Responsive UI**: Fiori Elements List Report with responsive table
- **Pagination**: Server-side pagination with record count display
- **Export**: Export data to Excel

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SAP BTP Cloud Foundry                     │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐    ┌──────────────────┐              │
│  │   App Router     │───▶│   CAP Service    │              │
│  │  (Fiori UI)      │    │  (Node.js)       │              │
│  └──────────────────┘    └────────┬─────────┘              │
│                                   │                         │
│                          ┌────────▼─────────┐              │
│                          │  SAP Cloud SDK   │              │
│                          │  + Destination   │              │
│                          └────────┬─────────┘              │
└───────────────────────────────────┼─────────────────────────┘
                                    │
                           ┌────────▼─────────┐
                           │   SAP EWM API    │
                           │ (OData v4)       │
                           └──────────────────┘
```

## Project Structure

```
sap-ewm-stock-app/
├── app/                          # Fiori Elements UI
│   ├── stock-lookup/             # Stock lookup application
│   │   ├── webapp/
│   │   │   ├── manifest.json     # UI5 application descriptor
│   │   │   ├── Component.js      # UI5 component
│   │   │   ├── index.html        # Entry point
│   │   │   └── i18n/             # Internationalization
│   │   ├── package.json
│   │   └── ui5.yaml              # UI5 build config
│   ├── xs-app.json               # App router config
│   └── package.json
├── db/
│   └── schema.cds                # Virtual entity definitions
├── srv/
│   ├── stock-service.cds         # Service definition
│   ├── stock-service.js          # Service implementation
│   └── annotations.cds           # UI annotations
├── mta.yaml                      # Deployment descriptor
├── xs-security.json              # Security configuration
├── package.json                  # Node.js dependencies
└── .cdsrc.json                   # CDS configuration
```

## Prerequisites

1. **SAP BTP Account** with Cloud Foundry environment
2. **SAP Business Application Studio** or local development environment
3. **Destination Configuration** (EWM_HMF) in BTP cockpit
4. **SAP EWM System** with `api_whse_physstockprod` API enabled

## Destination Configuration

Configure the `EWM_HMF` destination in SAP BTP Cockpit:

| Property | Value |
|----------|-------|
| Name | EWM_HMF |
| Type | HTTP |
| URL | `https://<your-sap-host>` |
| Proxy Type | Internet (or OnPremise with Cloud Connector) |
| Authentication | BasicAuthentication |
| User | `<technical-user>` |
| Password | `<password>` |

### Additional Properties

| Property | Value |
|----------|-------|
| sap-client | `<client-number>` |
| HTML5.DynamicDestination | true |

## Local Development

### Install Dependencies

```bash
npm install
cd app/stock-lookup && npm install
```

### Run Locally

```bash
# Start CAP server
cds watch

# In another terminal, start UI
cd app/stock-lookup
npm start
```

> Note: Local development requires destination mocking or hybrid testing setup.

## Deployment to SAP BTP

### Build the Application

```bash
# Build MTA archive
mbt build
```

### Deploy to Cloud Foundry

```bash
# Login to Cloud Foundry
cf login

# Deploy
cf deploy mta_archives/sap-ewm-stock-lookup_1.0.0.mtar
```

## API Integration

### External API

The application consumes the SAP standard API:

```
GET /sap/opu/odata4/sap/api_whse_physstockprod/srvd_a2x/sap/whsephysicalstockproducts/0001/WarehousePhysicalStockProducts
```

### Query Parameters

| Parameter | Description |
|-----------|-------------|
| $count | Always `true` for total record count |
| $top | Page size |
| $skip | Records to skip |
| $filter | Dynamic filter based on user input |

### Filter Example

```
$filter=Product eq 'MAT01' and EWMStockType eq 'F2'
```

## Security

- **Authentication**: XSUAA with OAuth2
- **Authorization**: Role-based access via `EWM_Stock_Viewer` role collection
- **Destination Security**: Basic Authentication via BTP Destination

## Error Handling

| Scenario | User Message |
|----------|-------------|
| No data found | "No stock data found for the given criteria" |
| API error | Fiori error dialog with details |
| Authentication failure | "Authentication failed. Please contact your administrator." |
| Connection error | "Unable to connect to SAP system. Please try again later." |

## Customization

### Adding New Filter Fields

1. Add field to `db/schema.cds`
2. Add to `SelectionFields` in `srv/annotations.cds`
3. Update filter logic in `srv/stock-service.js`

### Adding Table Columns

1. Add field to `db/schema.cds`
2. Add to `LineItem` in `srv/annotations.cds`

## Troubleshooting

### Common Issues

1. **Destination not found**: Verify destination name in BTP cockpit
2. **Authentication error**: Check credentials in destination configuration
3. **API not accessible**: Ensure EWM system has the API enabled
4. **CORS errors**: Use App Router for frontend deployment

### Logs

```bash
# View CAP service logs
cf logs sap-ewm-stock-lookup-srv --recent

# View app router logs
cf logs sap-ewm-stock-lookup-app --recent
```

## License

UNLICENSED - Internal use only
