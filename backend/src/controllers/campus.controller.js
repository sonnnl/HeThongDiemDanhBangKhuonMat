const { Campus } = require("../models/schemas");

/**
 * Controller quản lý cơ sở học tập
 */

// @desc    Lấy danh sách tất cả cơ sở
// @route   GET /api/campus
// @access  Private
exports.getAllCampuses = async (req, res) => {
  try {
    const campuses = await Campus.find().sort({ name: 1 });

    res.status(200).json({
      success: true,
      count: campuses.length,
      data: campuses,
    });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách cơ sở:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy danh sách cơ sở",
      error: error.message,
    });
  }
};

// @desc    Lấy cơ sở theo ID
// @route   GET /api/campus/:id
// @access  Private
exports.getCampusById = async (req, res) => {
  try {
    const campus = await Campus.findById(req.params.id);

    if (!campus) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy cơ sở với ID này",
      });
    }

    res.status(200).json({
      success: true,
      data: campus,
    });
  } catch (error) {
    console.error("Lỗi khi lấy thông tin cơ sở:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy thông tin cơ sở",
      error: error.message,
    });
  }
};

// @desc    Tạo cơ sở mới
// @route   POST /api/campus
// @access  Private (Admin)
exports.createCampus = async (req, res) => {
  try {
    const { name, code, address, description, location, image_url, status } =
      req.body;

    // Kiểm tra mã cơ sở đã tồn tại chưa
    const existingCampus = await Campus.findOne({ code });
    if (existingCampus) {
      return res.status(400).json({
        success: false,
        message: "Mã cơ sở này đã tồn tại",
      });
    }

    const campus = await Campus.create({
      name,
      code,
      address,
      description,
      location,
      image_url,
      status: status || "active",
    });

    res.status(201).json({
      success: true,
      data: campus,
      message: "Tạo cơ sở thành công",
    });
  } catch (error) {
    console.error("Lỗi khi tạo cơ sở mới:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi server khi tạo cơ sở mới",
      error: error.message,
    });
  }
};

// @desc    Cập nhật cơ sở
// @route   PUT /api/campus/:id
// @access  Private (Admin)
exports.updateCampus = async (req, res) => {
  try {
    const { name, code, address, description, location, image_url, status } =
      req.body;
    const campusId = req.params.id;

    // Kiểm tra mã cơ sở đã tồn tại chưa (trừ cơ sở hiện tại)
    if (code) {
      const existingCampus = await Campus.findOne({
        code,
        _id: { $ne: campusId },
      });

      if (existingCampus) {
        return res.status(400).json({
          success: false,
          message: "Mã cơ sở này đã tồn tại",
        });
      }
    }

    const campus = await Campus.findByIdAndUpdate(
      campusId,
      {
        name,
        code,
        address,
        description,
        location,
        image_url,
        status,
      },
      { new: true, runValidators: true }
    );

    if (!campus) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy cơ sở với ID này",
      });
    }

    res.status(200).json({
      success: true,
      data: campus,
      message: "Cập nhật cơ sở thành công",
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật cơ sở:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi server khi cập nhật cơ sở",
      error: error.message,
    });
  }
};

// @desc    Xóa cơ sở
// @route   DELETE /api/campus/:id
// @access  Private (Admin)
exports.deleteCampus = async (req, res) => {
  try {
    const campus = await Campus.findByIdAndDelete(req.params.id);

    if (!campus) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy cơ sở với ID này",
      });
    }

    res.status(200).json({
      success: true,
      message: "Xóa cơ sở thành công",
    });
  } catch (error) {
    console.error("Lỗi khi xóa cơ sở:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi server khi xóa cơ sở",
      error: error.message,
    });
  }
};
