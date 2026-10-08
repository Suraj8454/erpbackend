const express = require("express");
const {
    getAllQC,
    getQCById,
    createQC,
    getQCParameters
} = require("../controllers/qc.controller");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();

router.use(authMiddleware);

router.get("/", getAllQC);
router.get("/parameters", getQCParameters);
router.get("/:id", getQCById);
router.post("/", createQC);

module.exports = router;