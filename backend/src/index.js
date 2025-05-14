const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const path = require("path");
const passport = require("passport");
require("dotenv").config();
const env = require("./config/env");
const initAdmin = require("./config/initAdmin");

// Passport config
require("./config/passport")(passport);

// Kết nối đến cơ sở dữ liệu
connectDB().then(() => {
  // Khởi tạo tài khoản admin mặc định nếu chưa có
  initAdmin();
});

const app = express();

// Cấu hình CORS chi tiết
const corsOptions = {
  origin: env.FRONTEND_URL || "http://localhost:3000",
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true,
  exposedHeaders: ["x-auth-token"],
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Khởi tạo Passport
app.use(passport.initialize());

// Thư mục tĩnh
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Routes
app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/users", require("./routes/user.routes"));
app.use("/api/departments", require("./routes/department.routes"));
app.use("/api/majors", require("./routes/major.routes"));
app.use("/api/campuses", require("./routes/campus.routes"));
app.use("/api/courses", require("./routes/course.routes"));
app.use("/api/classes", require("./routes/class.routes"));
app.use("/api/semesters", require("./routes/semester.routes"));
app.use("/api/attendance", require("./routes/attendance.routes"));
app.use("/api/face-recognition", require("./routes/faceRecognition.routes"));
app.use("/api/notifications", require("./routes/notification.routes"));
app.use("/api/absence-requests", require("./routes/absenceRequest.routes"));
app.use("/api/facilities", require("./routes/facility.routes"));
app.use("/api/subjects", require("./routes/subject.routes"));
app.use("/api/teachers", require("./routes/teacher.routes.js"));

// Kiểm tra kết nối
app.get("/", (req, res) => {
  res.json({ message: "API Hệ thống Điểm danh Khuôn mặt" });
});

const PORT = env.PORT || 5000;

app.listen(PORT, () => console.log(`Máy chủ đang chạy trên cổng ${PORT}`));
