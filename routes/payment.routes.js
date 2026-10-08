const express = require("express");
const {
    getAllPayments,
    createPayment,
    getPaymentById,
    getPaymentSummary
} = require("../controllers/payment.controller");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();

router.use(authMiddleware);

router.get("/", getAllPayments);
router.get("/summary", getPaymentSummary);
router.get("/:id", getPaymentById);
router.post("/", createPayment);

module.exports = router;