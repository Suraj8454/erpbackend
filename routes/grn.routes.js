const express = require("express");
const {
    getAllGRNs,
    getGRNById,
    updateGRNStatus
} = require("../controllers/grn.controller");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();

router.use(authMiddleware);

router.get("/", getAllGRNs);
router.get("/:id", getGRNById);
router.patch("/:id/status", updateGRNStatus);

module.exports = router;