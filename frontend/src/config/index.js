// Các biến cấu hình toàn cục cho ứng dụng

// API URL từ biến môi trường hoặc URL mặc định
export const API_URL =
  process.env.REACT_APP_API_URL || "http://localhost:5000/api";

// Các biến cấu hình khác
export const APP_NAME = "FaceReg Attendance System";
export const TOKEN_KEY = "token";
export const USER_KEY = "user";

// Thời gian hết hạn token (ms)
export const TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24 giờ

// Cấu hình Face API
export const FACE_DETECTION_OPTIONS = {
  scoreThreshold: 0.5,
  inputSize: 224,
  scale: 0.8,
};

// Thời gian tự động refresh token (ms)
export const REFRESH_TOKEN_INTERVAL = 30 * 60 * 1000; // 30 phút
