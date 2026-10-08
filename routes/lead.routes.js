const express = require("express");
const {
    getAllLeads,
    getLeadById,
    createLead,
    updateLead,
    deleteLead,
    convertLeadToCustomer,
    addActivity
} = require("../controllers/lead.controller");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();

router.use(authMiddleware);

router.get("/", getAllLeads);
router.get("/:id", getLeadById);
router.post("/", createLead);
router.put("/:id", updateLead);
router.delete("/:id", deleteLead);
router.post("/:id/convert", convertLeadToCustomer);
router.post("/:id/activities", addActivity);

module.exports = router;