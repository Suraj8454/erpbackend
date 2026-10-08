const express = require("express");
const {
    // Sales
    getSalesSummary,
    getSalesByCustomer,
    getSalesByProduct,
    getSalesBySalesperson,
    getCustomerOutstanding,
    // Purchase
    getPurchaseSummary,
    getPurchaseBySupplier,
    getPurchasePriceHistory,
    // Inventory
    getStockReport,
    getStockMovement,
    getLowStockReport,
    getBatchWiseStock,
    // CRM
    getLeadFunnel,
    getLeadSourcePerformance,
    getQuotationConversion,
    // Financial
    getProfitLoss,
    getPaymentCollection,
    // Summary
    getReportSummary
} = require("../controllers/report.controller");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();

router.use(authMiddleware);

// Summary
router.get("/summary", getReportSummary);

// Sales reports
router.get("/sales/summary", getSalesSummary);
router.get("/sales/by-customer", getSalesByCustomer);
router.get("/sales/by-product", getSalesByProduct);
router.get("/sales/by-salesperson", getSalesBySalesperson);
router.get("/sales/outstanding", getCustomerOutstanding);

// Purchase reports
router.get("/purchase/summary", getPurchaseSummary);
router.get("/purchase/by-supplier", getPurchaseBySupplier);
router.get("/purchase/price-history", getPurchasePriceHistory);

// Inventory reports
router.get("/stock/current", getStockReport);
router.get("/stock/movement", getStockMovement);
router.get("/stock/low-stock", getLowStockReport);
router.get("/stock/batch-wise", getBatchWiseStock);

// CRM reports
router.get("/crm/lead-funnel", getLeadFunnel);
router.get("/crm/lead-source", getLeadSourcePerformance);
router.get("/crm/quotation-conversion", getQuotationConversion);

// Financial reports
router.get("/financial/profit-loss", getProfitLoss);
router.get("/financial/payment-collection", getPaymentCollection);

module.exports = router;