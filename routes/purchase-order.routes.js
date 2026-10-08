const express = require("express");
const {
    getAllPurchaseOrders,
    getPurchaseOrderById,
    createPurchaseOrder,
    updatePurchaseOrderStatus,
    receivePurchaseOrder,
    deletePurchaseOrder
} = require("../controllers/purchase-order.controller");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();

router.use(authMiddleware);

router.get("/", getAllPurchaseOrders);
router.get("/:id", getPurchaseOrderById);
router.post("/", createPurchaseOrder);
router.patch("/:id/status", updatePurchaseOrderStatus);
router.post("/:id/receive", receivePurchaseOrder);
router.delete("/:id", deletePurchaseOrder);

module.exports = router;