/**
 * UI5 Component for EWM Stock Lookup Application
 * 
 * Main entry point for the Fiori Elements application.
 * Extends UIComponent for standard lifecycle management.
 */
sap.ui.define([
    "sap/fe/core/AppComponent"
], function(AppComponent) {
    "use strict";

    return AppComponent.extend("ewm.stock.lookup.Component", {
        metadata: {
            manifest: "json"
        },

        /**
         * Initialize the component
         * Called automatically by the framework
         */
        init: function() {
            // Call parent init
            AppComponent.prototype.init.apply(this, arguments);

            // Log initialization for debugging
            console.log("[EWM Stock Lookup] Application initialized");
        },

        /**
         * Cleanup on component destroy
         */
        destroy: function() {
            // Call parent destroy
            AppComponent.prototype.destroy.apply(this, arguments);
            console.log("[EWM Stock Lookup] Application destroyed");
        }
    });
});
