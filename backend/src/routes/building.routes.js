const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middlewares/auth.middleware");
const buildingController = require("../controllers/building.controller");

// Building routes
router
  .route("/")
  .get(buildingController.getAllBuildings)
  .post(protect, authorize("admin"), buildingController.createBuilding);

router
  .route("/:id")
  .get(buildingController.getBuildingById)
  .put(protect, authorize("admin"), buildingController.updateBuilding)
  .delete(protect, authorize("admin"), buildingController.deleteBuilding);

module.exports = router;
