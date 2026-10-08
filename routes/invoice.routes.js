const express = require("express");
const {
    getAllInvoices,
    getInvoiceById,
    getOutstandingInvoices
} = require("../controllers/invoice.controller");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();

router.use(authMiddleware);

router.get("/", getAllInvoices);
router.get("/outstanding", getOutstandingInvoices);
router.get("/:id", getInvoiceById);

module.exports = router;