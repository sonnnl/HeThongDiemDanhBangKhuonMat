const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middlewares/auth.middleware");
const campusController = require("../controllers/campus.controller");

// Campus routes
router
  .route("/")
  .get(campusController.getAllCampuses)
  .post(protect, authorize("admin"), campusController.createCampus);

router
  .route("/:id")
  .get(campusController.getCampusById)
  .put(protect, authorize("admin"), campusController.updateCampus)
  .delete(protect, authorize("admin"), campusController.deleteCampus);

module.exports = router;
