const express = require("express");
const {
    getAllQuotations,
    getQuotationById,
    createQuotation,
    updateQuotation,
    updateQuotationStatus,
    approveQuotation,
    convertToSalesOrder,
    deleteQuotation
} = require("../controllers/quotation.controller");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();

router.use(authMiddleware);

router.get("/", getAllQuotations);
router.get("/:id", getQuotationById);
router.post("/", createQuotation);
router.put("/:id", updateQuotation);
router.patch("/:id/status", updateQuotationStatus);
router.post("/:id/approve", approveQuotation);
router.post("/:id/convert", convertToSalesOrder);
router.delete("/:id", deleteQuotation);

module.exports = router;