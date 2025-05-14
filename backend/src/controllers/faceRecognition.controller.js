const fs = require("fs");
const path = require("path");
const {
  User,
  AttendanceSession,
  AttendanceLog,
  TeachingClass,
} = require("../models/schemas");

// @desc    Lưu đặc trưng khuôn mặt
// @route   POST /api/face-recognition/save-features
// @access  Private
exports.saveFaceFeatures = async (req, res) => {
  try {
    const { userId, faceDescriptors } = req.body;

    if (!userId || !faceDescriptors || !Array.isArray(faceDescriptors)) {
      return res.status(400).json({
        success: false,
        message: "Thiếu dữ liệu đặc trưng khuôn mặt",
      });
    }

    // Tìm người dùng
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy người dùng",
      });
    }

    // Cập nhật đặc trưng khuôn mặt
    user.faceFeatures = {
      descriptors: faceDescriptors,
      lastUpdated: Date.now(),
    };

    await user.save();

    res.status(200).json({
      success: true,
      message: "Đã lưu đặc trưng khuôn mặt thành công",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ",
    });
  }
};

// @desc    Lấy đặc trưng khuôn mặt của sinh viên trong một lớp
// @route   GET /api/face-recognition/class-features/:classId
// @access  Private (Chỉ giáo viên)
exports.getClassFaceFeatures = async (req, res) => {
  try {
    const { classId } = req.params;

    // Tìm danh sách sinh viên trong lớp
    const teachingClass = await TeachingClass.findById(classId).populate({
      path: "students",
      select: "full_name school_info faceFeatures avatar_url",
    });

    if (!teachingClass) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp học",
      });
    }

    // Lọc sinh viên có đặc trưng khuôn mặt
    const studentsWithFaces = teachingClass.students
      .filter(
        (student) =>
          student.faceFeatures &&
          student.faceFeatures.descriptors &&
          student.faceFeatures.descriptors.length > 0
      )
      .map((student) => ({
        _id: student._id,
        full_name: student.full_name,
        student_id: student.school_info?.student_id,
        avatar_url: student.avatar_url,
        faceDescriptors: student.faceFeatures.descriptors,
      }));

    res.status(200).json({
      success: true,
      data: studentsWithFaces,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ",
    });
  }
};

// @desc    Xác nhận điểm danh bằng khuôn mặt
// @route   POST /api/face-recognition/verify-attendance
// @access  Private
exports.verifyAttendance = async (req, res) => {
  try {
    const { sessionId, studentId, faceDescriptor, confidence, imageBase64 } =
      req.body;

    if (!sessionId || !studentId || !faceDescriptor) {
      return res.status(400).json({
        success: false,
        message: "Thiếu dữ liệu điểm danh",
      });
    }

    // Kiểm tra phiên điểm danh
    const session = await AttendanceSession.findById(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy phiên điểm danh",
      });
    }

    if (session.status !== "active") {
      return res.status(400).json({
        success: false,
        message: "Phiên điểm danh không hoạt động",
      });
    }

    // Kiểm tra sinh viên có trong danh sách điểm danh không
    const teachingClass = await TeachingClass.findById(
      session.teaching_class_id
    );

    if (!teachingClass.students.includes(studentId)) {
      return res.status(400).json({
        success: false,
        message: "Sinh viên không thuộc lớp học này",
      });
    }

    // Lưu ảnh khuôn mặt nếu có
    let capturedFaceUrl = null;
    if (imageBase64) {
      const uploadDir = path.join(__dirname, "../../uploads/faces");

      // Đảm bảo thư mục tồn tại
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const fileName = `face_${studentId}_${sessionId}_${Date.now()}.jpg`;
      const filePath = path.join(uploadDir, fileName);

      // Lưu ảnh từ base64
      const base64Data = imageBase64.replace(/^data:image\/jpeg;base64,/, "");
      fs.writeFileSync(filePath, base64Data, "base64");

      capturedFaceUrl = `/uploads/faces/${fileName}`;
    }

    // Kiểm tra xem sinh viên đã điểm danh chưa
    let attendanceLog = await AttendanceLog.findOne({
      session_id: sessionId,
      student_id: studentId,
    });

    if (attendanceLog) {
      // Cập nhật log nếu đã tồn tại
      attendanceLog.status = "present";
      attendanceLog.recognized = true;
      attendanceLog.recognized_confidence = confidence || 0;
      if (capturedFaceUrl) {
        attendanceLog.captured_face_url = capturedFaceUrl;
      }
      attendanceLog.timestamp = Date.now();

      await attendanceLog.save();
    } else {
      // Tạo log mới nếu chưa tồn tại
      attendanceLog = await AttendanceLog.create({
        session_id: sessionId,
        student_id: studentId,
        status: "present",
        recognized: true,
        recognized_confidence: confidence || 0,
        captured_face_url: capturedFaceUrl,
        timestamp: Date.now(),
      });

      // Thêm sinh viên vào danh sách có mặt
      if (
        !session.students_present.some(
          (entry) => entry.student_id.toString() === studentId
        )
      ) {
        session.students_present.push({
          student_id: studentId,
          timestamp: Date.now(),
          check_type: "auto",
        });

        // Xóa khỏi danh sách vắng mặt nếu có
        session.students_absent = session.students_absent.filter(
          (id) => id.toString() !== studentId
        );

        await session.save();
      }
    }

    res.status(200).json({
      success: true,
      message: "Điểm danh thành công",
      data: attendanceLog,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ",
    });
  }
};

// @desc    Điểm danh thủ công
// @route   POST /api/face-recognition/manual-attendance
// @access  Private (Chỉ giáo viên)
exports.manualAttendance = async (req, res) => {
  try {
    const { sessionId, studentId, note } = req.body;

    // Kiểm tra sessionId và studentId
    if (!sessionId || !studentId) {
      return res.status(400).json({
        success: false,
        message: "Thiếu ID phiên hoặc ID sinh viên",
      });
    }

    // Kiểm tra phiên điểm danh
    const session = await AttendanceSession.findById(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy phiên điểm danh",
      });
    }

    // Chỉ cho phép điểm danh thủ công khi phiên đang active
    if (session.status !== "active") {
      return res.status(400).json({
        success: false,
        message: "Phiên điểm danh không hoạt động",
      });
    }

    // Tìm hoặc tạo log điểm danh, luôn là 'present'
    let attendanceLog = await AttendanceLog.findOne({
      session_id: sessionId,
      student_id: studentId,
    });

    if (attendanceLog) {
      // Cập nhật log nếu đã tồn tại
      attendanceLog.status = "present"; // Luôn là present
      attendanceLog.recognized = false; // Đánh dấu là không nhận diện tự động
      attendanceLog.note = note; // Cập nhật ghi chú nếu có
      attendanceLog.timestamp = Date.now();

      await attendanceLog.save();
    } else {
      // Tạo log mới nếu chưa tồn tại
      attendanceLog = await AttendanceLog.create({
        session_id: sessionId,
        student_id: studentId,
        status: "present", // Luôn là present
        recognized: false, // Đánh dấu là không nhận diện tự động
        note: note, // Thêm ghi chú nếu có
        timestamp: Date.now(),
      });
    }

    // Cập nhật danh sách sinh viên có mặt/vắng mặt trong session
    // Luôn thêm vào danh sách có mặt
    if (
      !session.students_present.some(
        (entry) => entry.student_id.toString() === studentId
      )
    ) {
      session.students_present.push({
        student_id: studentId,
        timestamp: Date.now(),
        check_type: "manual", // Đánh dấu là điểm danh thủ công
      });
    }

    // Luôn xóa khỏi danh sách vắng mặt (nếu có)
    session.students_absent = session.students_absent.filter(
      (id) => id.toString() !== studentId
    );

    // Lưu thay đổi của session
    await session.save();

    res.status(200).json({
      success: true,
      message: "Điểm danh thủ công thành công (đã ghi nhận có mặt)",
      data: attendanceLog, // Trả về log đã tạo/cập nhật
    });
  } catch (error) {
    console.error("Lỗi điểm danh thủ công:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ",
      error: error.message,
    });
  }
};
