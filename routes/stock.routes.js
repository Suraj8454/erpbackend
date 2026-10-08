const express = require("express");
const {
    getCurrentStock,
    getStockSummary,
    getStockLedger,
    getBatches,
    adjustStock,
    getStockMovements
} = require("../controllers/stock.controller");
const { authMiddleware, requireRole } = require("../middleware/auth");

const router = express.Router();

router.use(authMiddleware);

router.get("/", getCurrentStock);
router.get("/summary", getStockSummary);
router.get("/ledger", getStockLedger);
router.get("/batches", getBatches);
router.get("/movements/:productId", getStockMovements);
router.post("/adjust", requireRole("admin", "manager", "warehouse_manager"), adjustStock);
router.get("/movements/:productId", getStockMovements);

module.exports = router;