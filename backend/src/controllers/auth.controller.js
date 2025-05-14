const { User, MainClass, Notification } = require("../models/schemas");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const env = require("../config/env");
const passport = require("passport");
const mongoose = require("mongoose");

// Tạo token JWT
const generateToken = (id) => {
  return jwt.sign({ id }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });
};

// @desc    Đăng nhập người dùng
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Kiểm tra email và password
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng cung cấp email và mật khẩu",
      });
    }

    // Kiểm tra người dùng
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Email hoặc mật khẩu không đúng",
      });
    }

    // Kiểm tra mật khẩu
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Email hoặc mật khẩu không đúng",
      });
    }

    // Kiểm tra trạng thái tài khoản (ngoại trừ admin)
    if (user.role !== "admin" && user.status !== "approved") {
      let message = "Tài khoản của bạn chưa được phê duyệt";
      if (user.status === "rejected") {
        message = "Tài khoản của bạn đã bị từ chối";
      }
      return res.status(403).json({
        success: false,
        message,
        status: user.status,
      });
    }

    // Cập nhật thời gian đăng nhập
    user.last_login = Date.now();
    await user.save();

    // Trả về token
    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      token,
      user: {
        _id: user._id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        status: user.status,
        avatar_url: user.avatar_url,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ",
    });
  }
};

// @desc    Đăng ký người dùng
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
  try {
    const {
      email,
      password,
      role,
      full_name,
      school_info,
      contact,
      faceFeatures,
    } = req.body;

    // Xác thực dữ liệu đầu vào
    if (!email || !password || !full_name) {
      return res.status(400).json({
        success: false,
        message:
          "Vui lòng cung cấp đầy đủ thông tin: email, mật khẩu và họ tên",
      });
    }

    // Xác thực vai trò, chỉ cho phép student hoặc teacher
    if (!role || !["student", "teacher", "admin"].includes(role)) {
      return res.status(400).json({
        success: false,
        message:
          "Vai trò không hợp lệ. Vui lòng chọn sinh viên, giảng viên hoặc admin",
      });
    }

    // --- Thêm validation chi tiết cho school_info ---
    if (!school_info || !school_info.department_id) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng chọn khoa",
      });
    }

    if (role === "student") {
      if (!school_info.student_id) {
        return res.status(400).json({
          success: false,
          message: "Vui lòng nhập Mã số sinh viên (MSSV)",
        });
      }
      if (!school_info.class_id) {
        return res.status(400).json({
          success: false,
          message: "Vui lòng chọn lớp",
        });
      }
    } else if (role === "teacher") {
      if (!school_info.teacher_code) {
        return res.status(400).json({
          success: false,
          message: "Vui lòng nhập Mã giảng viên",
        });
      }
    }
    // --- Kết thúc validation ---

    // Kiểm tra người dùng đã tồn tại
    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({
        success: false,
        message: "Email đã được sử dụng",
      });
    }

    // Mã hóa mật khẩu
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Tạo người dùng mới
    const userData = {
      email,
      password: hashedPassword,
      role,
      full_name,
      status: role === "admin" ? "approved" : "pending", // Admin tự động phê duyệt
      created_at: Date.now(),
      last_login: Date.now(),
    };

    // Thêm contact nếu có
    if (contact) {
      userData.contact = {};
      if (contact.phone) {
        userData.contact.phone = contact.phone;
      }
      if (contact.address) {
        userData.contact.address = contact.address;
      }
    }

    // Thêm faceFeatures nếu có
    if (
      faceFeatures &&
      faceFeatures.descriptors &&
      faceFeatures.descriptors.length > 0
    ) {
      userData.faceFeatures = {
        descriptors: faceFeatures.descriptors,
        lastUpdated: new Date(),
      };
      console.log(
        `Đăng ký thủ công: Đã nhận ${faceFeatures.descriptors.length} dữ liệu khuôn mặt.`
      );
    }

    // --- Xây dựng school_info có chọn lọc ---
    const schoolInfoData = {};

    if (role === "student") {
      // Đối với sinh viên, chỉ cần class_id và student_id (và year nếu có từ form)
      // major_id và department_id sẽ được suy ra từ class_id
      if (school_info.student_id) {
        schoolInfoData.student_id = school_info.student_id;
      }
      if (school_info.class_id) {
        schoolInfoData.class_id = school_info.class_id;
      }
      if (school_info.year) {
        // Nếu form đăng ký thủ công có gửi 'year'
        schoolInfoData.year = school_info.year;
      }
      // Xóa department_id nếu nó được gửi từ form cho student, vì nó sẽ được suy ra
      // schoolInfoData.department_id = undefined; // Hoặc không gán từ đầu
    } else if (role === "teacher") {
      // Đối với giảng viên, lưu department_id và teacher_code
      if (school_info.department_id) {
        schoolInfoData.department_id = school_info.department_id;
      }
      if (school_info.teacher_code) {
        schoolInfoData.teacher_code = school_info.teacher_code;
      }
    }
    // Gán school_info đã được xây dựng
    userData.school_info = schoolInfoData;
    // --- Kết thúc xây dựng school_info ---

    const user = await User.create(userData);

    if (user) {
      // Gửi thông báo đến admin
      if (role === "teacher") {
        // Gửi thông báo cho admin
        await Notification.create({
          title: "Đăng ký tài khoản giảng viên mới",
          content: `Giảng viên ${full_name} (${email}) đã đăng ký và đang chờ phê duyệt.`,
          sender_id: user._id,
        });
      } else if (role === "student") {
        let assigned_advisor_id = null;
        if (schoolInfoData.class_id) {
          try {
            const mainClass = await MainClass.findById(schoolInfoData.class_id);
            if (mainClass) {
              assigned_advisor_id = mainClass.advisor_id;
              if (assigned_advisor_id) {
                user.advisor_id = assigned_advisor_id;
                await user.save();
              }
              if (!mainClass.pending_students) {
                mainClass.pending_students = [];
              }
              if (!mainClass.pending_students.includes(user._id)) {
                mainClass.pending_students.push(user._id);
                await mainClass.save();
                console.log(
                  `Added student ${user._id} to pending list of class ${mainClass._id}`
                );
              }
              if (assigned_advisor_id) {
                await Notification.create({
                  title: "Sinh viên mới đăng ký vào lớp",
                  content: `Sinh viên ${full_name} (${email}) đã đăng ký vào lớp ${mainClass.name} (${mainClass.class_code}) mà bạn làm cố vấn, đang chờ phê duyệt.`,
                  sender_id: user._id,
                  receiver_id: assigned_advisor_id,
                  main_class_id: mainClass._id,
                });
              }
            }
          } catch (err) {
            console.error(
              "Lỗi khi xử lý lớp chính và cố vấn cho sinh viên đăng ký:",
              err
            );
          }
        }
      }

      const token = generateToken(user._id);

      res.status(201).json({
        success: true,
        token,
        user: {
          _id: user._id,
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          status: user.status,
        },
        message:
          user.status === "approved"
            ? "Đăng ký thành công!"
            : "Đăng ký thành công! Tài khoản của bạn đang chờ được phê duyệt.",
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Dữ liệu người dùng không hợp lệ",
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ",
    });
  }
};

// @desc    Lấy thông tin người dùng hiện tại
// @route   GET /api/auth/me
// @access  Private
exports.getCurrentUser = async (req, res) => {
  try {
    // Lấy thông tin người dùng và chọn các trường cần thiết, bao gồm cả school_info
    const user = await User.findById(req.user.id)
      .select(
        "_id email full_name role status school_info contact faceFeatures avatar_url"
      )
      .lean(); // Sử dụng lean() để có plain JavaScript object

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "Người dùng không tồn tại" });
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ",
    });
  }
};

// @desc    Đăng nhập bằng Google
// @route   GET /api/auth/google/callback
// @access  Public
exports.googleCallback = async (req, res) => {
  try {
    const { id, email, displayName, photos, isNewUser } = req.user;
    const FRONTEND_URL = env.FRONTEND_URL;

    // Kiểm tra nếu đây là người dùng mới
    if (isNewUser) {
      const googleId = id;
      const name = displayName;
      // Kiểm tra photos trước khi truy cập để tránh lỗi
      const avatar = photos && photos.length > 0 ? photos[0].value : "";
      return res.redirect(
        `${FRONTEND_URL}/login/success?needsRegistration=true&email=${email}&googleId=${googleId}&name=${encodeURIComponent(
          name
        )}&avatar=${encodeURIComponent(avatar || "")}`
      );
    }

    // Tìm user trong DB
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      // Nếu người dùng tồn tại, kiểm tra trạng thái
      if (existingUser.status === "pending") {
        // User đã đăng ký nhưng đang chờ phê duyệt
        const token = jwt.sign({ id: existingUser._id }, env.JWT_SECRET, {
          expiresIn: "1d",
        });
        return res.redirect(
          `${FRONTEND_URL}/login/success?token=${token}&status=pending&role=${existingUser.role}`
        );
      } else if (existingUser.status === "rejected") {
        // User đã bị từ chối
        return res.redirect(
          `${FRONTEND_URL}/login/success?status=rejected&role=${existingUser.role}`
        );
      } else if (existingUser.status === "approved") {
        // User đã được phê duyệt, đăng nhập thành công
        const token = jwt.sign({ id: existingUser._id }, env.JWT_SECRET, {
          expiresIn: "1d",
        });

        // Cập nhật googleId và avatar nếu cần
        // Kiểm tra photos trước khi truy cập
        const avatarUrl = photos && photos.length > 0 ? photos[0].value : "";
        if (
          !existingUser.google_id ||
          (avatarUrl && existingUser.avatar_url !== avatarUrl)
        ) {
          await User.findByIdAndUpdate(existingUser._id, {
            google_id: id,
            avatar_url: avatarUrl,
          });
        }

        return res.redirect(`${FRONTEND_URL}/login/success?token=${token}`);
      }
    } else {
      // Người dùng không tồn tại trong hệ thống, chuyển hướng đến trang đăng ký
      const googleId = id;
      const name = displayName;
      // Kiểm tra photos trước khi truy cập
      const avatar = photos && photos.length > 0 ? photos[0].value : "";
      return res.redirect(
        `${FRONTEND_URL}/login/success?needsRegistration=true&email=${email}&googleId=${googleId}&name=${encodeURIComponent(
          name
        )}&avatar=${encodeURIComponent(avatar || "")}`
      );
    }
  } catch (error) {
    console.error("Google callback error:", error);
    const FRONTEND_URL = env.FRONTEND_URL;
    return res.redirect(`${FRONTEND_URL}/login/error`);
  }
};

/**
 * Hoàn tất đăng ký cho người dùng đăng nhập qua Google
 * @route POST /api/auth/google-complete
 * @access Public
 */
exports.completeGoogleSignup = async (req, res) => {
  try {
    const {
      email,
      googleId,
      fullName,
      role,
      avatarUrl,
      school_info,
      contact,
      faceFeatures,
    } = req.body;

    // Kiểm tra thông tin
    if (!email || !googleId || !role) {
      return res.status(400).json({
        success: false,
        message: "Thiếu thông tin bắt buộc",
      });
    }

    // Kiểm tra email đã tồn tại chưa
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email đã tồn tại trong hệ thống",
      });
    }

    const userData = {
      email,
      google_id: googleId,
      full_name: fullName,
      role,
      avatar_url: avatarUrl,
      status: "pending",
      created_at: Date.now(),
      last_login: Date.now(),
    };

    if (school_info) {
      // Khởi tạo lại newSchoolInfo để tránh kế thừa các trường không mong muốn
      const newSchoolInfo = {};

      if (role === "teacher") {
        newSchoolInfo.teacher_code = school_info.teacher_code || undefined;
        newSchoolInfo.department_id = school_info.department_id || undefined;
      } else if (role === "student") {
        newSchoolInfo.student_id = school_info.student_id || undefined;
        newSchoolInfo.class_id = school_info.class_id || undefined;
        newSchoolInfo.year = school_info.year || undefined;
        // Không lưu major_id, department_id, class name trực tiếp vào User.school_info cho student
        // Chúng sẽ được suy ra từ class_id khi cần
      }
      userData.school_info = { ...userData.school_info, ...newSchoolInfo }; // Merge để giữ lại các trường khác có thể đã có
    }

    if (contact) {
      userData.contact = contact;
    }

    if (
      faceFeatures &&
      faceFeatures.descriptors &&
      faceFeatures.descriptors.length > 0
    ) {
      userData.faceFeatures = {
        descriptors: faceFeatures.descriptors,
        lastUpdated: new Date(),
      };
      console.log(
        `Đã nhận ${faceFeatures.descriptors.length} dữ liệu khuôn mặt từ người dùng`
      );
    }

    let assigned_advisor_id = null;
    let mainClass = null;

    if (
      role === "student" &&
      userData.school_info &&
      userData.school_info.class_id
    ) {
      try {
        mainClass = await MainClass.findById(userData.school_info.class_id);
        if (mainClass && mainClass.advisor_id) {
          assigned_advisor_id = mainClass.advisor_id;
          userData.advisor_id = assigned_advisor_id;
        }
      } catch (classError) {
        console.error(
          "Lỗi khi tìm lớp hoặc cố vấn cho Google Signup:",
          classError
        );
      }
    }

    const newUser = await User.create(userData);

    if (role === "student" && mainClass) {
      try {
        if (!mainClass.pending_students) {
          mainClass.pending_students = [];
        }
        if (!mainClass.pending_students.includes(newUser._id)) {
          mainClass.pending_students.push(newUser._id);
          await mainClass.save();
          console.log(
            `Added student ${newUser._id} to pending list of class ${mainClass._id}`
          );
        }

        if (assigned_advisor_id) {
          try {
            await Notification.create({
              title: "Sinh viên mới đăng ký vào lớp (Google)",
              content: `Sinh viên ${newUser.full_name} (${newUser.email}) đã đăng ký vào lớp ${mainClass.name} mà bạn làm cố vấn (qua Google) và đang chờ phê duyệt`,
              sender_id: newUser._id,
              receiver_id: assigned_advisor_id,
              main_class_id: mainClass._id,
            });
          } catch (notifError) {
            console.error(
              "Không thể tạo thông báo (Google Signup):",
              notifError
            );
          }
        }
      } catch (classError) {
        console.error(
          "Lỗi khi thêm sinh viên vào danh sách chờ duyệt (Google Signup):",
          classError
        );
      }
    }

    const token = generateToken(newUser._id);

    return res.status(201).json({
      success: true,
      message: "Đăng ký thành công, đang chờ phê duyệt",
      user: {
        _id: newUser._id,
        email: newUser.email,
        full_name: newUser.full_name,
        role: newUser.role,
        status: newUser.status,
        avatar_url: newUser.avatar_url,
        has_face_data: !!userData.faceFeatures,
      },
      token,
    });
  } catch (error) {
    console.error("Complete Google Signup error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi máy chủ",
      error: error.message,
    });
  }
};

// @desc    Phê duyệt người dùng
// @route   PUT /api/auth/approve/:id
// @access  Private (Admin/Teacher)
exports.approveUser = async (req, res) => {
  try {
    const { id } = req.params;
    const approver = req.user;

    // Tìm người dùng cần phê duyệt
    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy người dùng",
      });
    }

    // Kiểm tra quyền phê duyệt
    if (user.role === "teacher" && approver.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền phê duyệt giảng viên",
      });
    }

    if (user.role === "student") {
      // Sinh viên chỉ có thể được phê duyệt bởi giáo viên cố vấn hoặc admin
      if (
        approver.role !== "admin" &&
        (!user.advisor_id ||
          user.advisor_id.toString() !== approver._id.toString())
      ) {
        return res.status(403).json({
          success: false,
          message: "Bạn không phải là giáo viên cố vấn của sinh viên này",
        });
      }
    }

    // Cập nhật trạng thái
    user.status = "approved";
    user.approved_by = approver._id;
    user.approval_date = Date.now();

    await user.save();

    // Nếu là sinh viên và có class_id trong thông tin school_info, thêm vào lớp
    if (
      user.role === "student" &&
      user.school_info &&
      user.school_info.class_id
    ) {
      try {
        // Tìm lớp
        const mainClass = await MainClass.findById(user.school_info.class_id);
        if (mainClass) {
          // Kiểm tra xem sinh viên đã có trong danh sách chưa
          if (!mainClass.students.includes(user._id)) {
            // Thêm sinh viên vào danh sách
            mainClass.students.push(user._id);
            await mainClass.save();
            console.log(`Added student ${user._id} to class ${mainClass._id}`);
          }
        }
      } catch (classError) {
        console.error("Error adding student to class:", classError);
        // Không trả về lỗi, vẫn phê duyệt người dùng
      }
    }

    res.status(200).json({
      success: true,
      message: "Phê duyệt người dùng thành công",
      user: {
        _id: user._id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        status: user.status,
      },
    });
  } catch (error) {
    console.error("Approve user error:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ",
    });
  }
};

// @desc    Từ chối người dùng
// @route   PUT /api/auth/reject/:id
// @access  Private (Admin/Teacher)
exports.rejectUser = async (req, res) => {
  try {
    const { id } = req.params;
    const rejector = req.user;

    // Tìm người dùng cần từ chối
    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy người dùng",
      });
    }

    // Kiểm tra quyền từ chối
    if (user.role === "teacher" && rejector.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền từ chối giảng viên",
      });
    }

    if (user.role === "student") {
      // Sinh viên chỉ có thể bị từ chối bởi giáo viên cố vấn hoặc admin
      if (
        rejector.role !== "admin" &&
        (!user.advisor_id ||
          user.advisor_id.toString() !== rejector._id.toString())
      ) {
        return res.status(403).json({
          success: false,
          message: "Bạn không phải là giáo viên cố vấn của sinh viên này",
        });
      }
    }

    // Cập nhật trạng thái
    user.status = "rejected";
    user.approved_by = rejector._id;
    user.approval_date = Date.now();

    await user.save();

    res.status(200).json({
      success: true,
      message: "Từ chối người dùng thành công",
      user: {
        _id: user._id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        status: user.status,
      },
    });
  } catch (error) {
    console.error("Reject user error:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ",
    });
  }
};

// @desc    Lấy danh sách người dùng chờ phê duyệt
// @route   GET /api/auth/pending
// @access  Private (Admin/Teacher)
exports.getPendingUsers = async (req, res) => {
  try {
    const approver = req.user;
    let query = { status: "pending" };

    // Nếu là giáo viên, chỉ lấy những sinh viên có advisor_id là mình
    if (approver.role === "teacher") {
      query = {
        status: "pending",
        role: "student",
        advisor_id: approver._id,
      };
    }

    const pendingUsers = await User.find(query)
      .select("-password")
      .populate("advisor_id", "full_name email");

    res.status(200).json({
      success: true,
      count: pendingUsers.length,
      data: pendingUsers,
    });
  } catch (error) {
    console.error("Get pending users error:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ",
    });
  }
};

// @desc    Kiểm tra trạng thái người dùng theo email và Google ID
// @route   GET /api/auth/check-status
// @access  Public
exports.checkUserStatus = async (req, res) => {
  try {
    const { email, googleId } = req.query;

    if (!email && !googleId) {
      return res.status(400).json({
        success: false,
        message: "Cần cung cấp email hoặc Google ID để kiểm tra",
      });
    }

    // Tạo query tìm kiếm
    const query = {};
    if (email) query.email = email;
    if (googleId) query.google_id = googleId;

    const user = await User.findOne(query).select(
      "_id email full_name role status avatar_url"
    );

    if (!user) {
      return res.status(200).json({
        success: true,
        exists: false,
        message: "Người dùng chưa đăng ký",
      });
    }

    return res.status(200).json({
      success: true,
      exists: true,
      user: {
        _id: user._id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        status: user.status,
        avatar_url: user.avatar_url,
      },
      message: `Tìm thấy người dùng với trạng thái: ${user.status}`,
    });
  } catch (error) {
    console.error("Check user status error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi máy chủ",
    });
  }
};

module.exports = {
  login: exports.login,
  register: exports.register,
  getCurrentUser: exports.getCurrentUser,
  googleCallback: exports.googleCallback,
  completeGoogleSignup: exports.completeGoogleSignup,
  approveUser: exports.approveUser,
  rejectUser: exports.rejectUser,
  getPendingUsers: exports.getPendingUsers,
  checkUserStatus: exports.checkUserStatus,
};
