const express = require("express");
const {
    getAllEnquiries,
    getEnquiryById,
    createEnquiry,
    updateEnquiry,
    updateEnquiryStatus,
    deleteEnquiry,
    convertToQuotation,
} = require("../controllers/enquiry.controller");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();

router.use(authMiddleware);

router.get("/", getAllEnquiries);
router.get("/:id", getEnquiryById);
router.post("/", createEnquiry);
router.put("/:id", updateEnquiry);
router.patch("/:id/status", updateEnquiryStatus);
router.delete("/:id", deleteEnquiry);
router.post("/:id/convert", convertToQuotation);

module.exports = router;