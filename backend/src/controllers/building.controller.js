const { Building, Campus } = require("../models/schemas");

/**
 * Controller quản lý tòa nhà
 */

// @desc    Lấy danh sách tất cả tòa nhà
// @route   GET /api/buildings
// @access  Private
exports.getAllBuildings = async (req, res) => {
  try {
    const { campus_id } = req.query;
    const query = {};

    if (campus_id) {
      query.campus_id = campus_id;
    }

    const buildings = await Building.find(query)
      .populate("campus_id", "name code")
      .sort({ name: 1 });

    res.status(200).json({
      success: true,
      count: buildings.length,
      data: buildings,
    });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách tòa nhà:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy danh sách tòa nhà",
      error: error.message,
    });
  }
};

// @desc    Lấy tòa nhà theo ID
// @route   GET /api/buildings/:id
// @access  Private
exports.getBuildingById = async (req, res) => {
  try {
    const building = await Building.findById(req.params.id).populate(
      "campus_id",
      "name code address"
    );

    if (!building) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy tòa nhà với ID này",
      });
    }

    res.status(200).json({
      success: true,
      data: building,
    });
  } catch (error) {
    console.error("Lỗi khi lấy thông tin tòa nhà:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy thông tin tòa nhà",
      error: error.message,
    });
  }
};

// @desc    Tạo tòa nhà mới
// @route   POST /api/buildings
// @access  Private (Admin)
exports.createBuilding = async (req, res) => {
  try {
    const {
      name,
      code,
      campus_id,
      floors_count,
      year_built,
      facilities,
      status,
      image_url,
    } = req.body;

    // Kiểm tra campus tồn tại
    const campus = await Campus.findById(campus_id);
    if (!campus) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy cơ sở với ID này",
      });
    }

    // Kiểm tra mã tòa nhà đã tồn tại chưa
    const existingBuilding = await Building.findOne({ code });
    if (existingBuilding) {
      return res.status(400).json({
        success: false,
        message: "Mã tòa nhà này đã tồn tại",
      });
    }

    const building = await Building.create({
      name,
      code,
      campus_id,
      floors_count: floors_count || 1,
      year_built,
      status: status || "active",
      facilities: facilities || [],
      image_url,
    });

    res.status(201).json({
      success: true,
      data: building,
      message: "Tạo tòa nhà thành công",
    });
  } catch (error) {
    console.error("Lỗi khi tạo tòa nhà mới:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi server khi tạo tòa nhà mới",
      error: error.message,
    });
  }
};

// @desc    Cập nhật tòa nhà
// @route   PUT /api/buildings/:id
// @access  Private (Admin)
exports.updateBuilding = async (req, res) => {
  try {
    const {
      name,
      code,
      campus_id,
      floors_count,
      year_built,
      facilities,
      status,
      image_url,
    } = req.body;
    const buildingId = req.params.id;

    // Kiểm tra campus tồn tại
    if (campus_id) {
      const campus = await Campus.findById(campus_id);
      if (!campus) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy cơ sở với ID này",
        });
      }
    }

    // Kiểm tra mã tòa nhà đã tồn tại chưa (trừ tòa nhà hiện tại)
    if (code) {
      const existingBuilding = await Building.findOne({
        code,
        _id: { $ne: buildingId },
      });

      if (existingBuilding) {
        return res.status(400).json({
          success: false,
          message: "Mã tòa nhà này đã tồn tại",
        });
      }
    }

    const building = await Building.findByIdAndUpdate(
      buildingId,
      {
        name,
        code,
        campus_id,
        floors_count,
        year_built,
        status,
        facilities,
        image_url,
      },
      { new: true, runValidators: true }
    );

    if (!building) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy tòa nhà với ID này",
      });
    }

    res.status(200).json({
      success: true,
      data: building,
      message: "Cập nhật tòa nhà thành công",
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật tòa nhà:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi server khi cập nhật tòa nhà",
      error: error.message,
    });
  }
};

// @desc    Xóa tòa nhà
// @route   DELETE /api/buildings/:id
// @access  Private (Admin)
exports.deleteBuilding = async (req, res) => {
  try {
    const building = await Building.findByIdAndDelete(req.params.id);

    if (!building) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy tòa nhà với ID này",
      });
    }

    res.status(200).json({
      success: true,
      message: "Xóa tòa nhà thành công",
    });
  } catch (error) {
    console.error("Lỗi khi xóa tòa nhà:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi server khi xóa tòa nhà",
      error: error.message,
    });
  }
};
