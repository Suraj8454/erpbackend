const express = require("express");
const {
    getAllSalesOrders,
    getSalesOrderById,
    updateSalesOrderStatus,
    dispatchSalesOrder,
    generateInvoice,
    deleteSalesOrder
} = require("../controllers/sales-order.controller");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();

router.use(authMiddleware);

router.get("/", getAllSalesOrders);
router.get("/:id", getSalesOrderById);
router.patch("/:id/status", updateSalesOrderStatus);
router.post("/:id/dispatch", dispatchSalesOrder);
router.post("/:id/generate-invoice", generateInvoice);
router.delete("/:id", deleteSalesOrder);

module.exports = router;