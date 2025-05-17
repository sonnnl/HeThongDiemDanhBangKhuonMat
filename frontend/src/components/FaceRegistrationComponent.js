import React, { useState, useEffect, useRef, lazy, Suspense } from "react";
import { useSnackbar } from "notistack";
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Stack,
  Avatar,
  Paper,
  FormControlLabel,
  Switch,
} from "@mui/material";
import {
  CameraAlt,
  CheckCircleOutline,
  ErrorOutline,
  Person,
  Replay,
  Visibility,
  VisibilityOff,
} from "@mui/icons-material";
import { loadModels, detectFace } from "../utils/faceUtils";
import * as faceapi from "face-api.js";

// Lazy load Webcam
const Webcam = lazy(() => import("react-webcam"));

// Consistent video constraints
const videoConstraints = {
  width: { ideal: 480 },
  height: { ideal: 360 },
  facingMode: "user",
};

const FaceRegistrationComponent = ({
  onFaceDataCapture,
  requiredImages = 3,
}) => {
  // Refs
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);

  // State
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [modelLoadingError, setModelLoadingError] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [capturedImages, setCapturedImages] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [captureError, setCaptureError] = useState("");
  const [showLandmarks, setShowLandmarks] = useState(true);
  const { enqueueSnackbar } = useSnackbar();

  // 1. Load face recognition models on mount
  useEffect(() => {
    const initModels = async () => {
      setModelLoadingError(null); // Reset error
      try {
        await loadModels();
        setModelsLoaded(true);
      } catch (err) {
        console.error("[FaceComponent] Error loading models:", err);
        setModelLoadingError(
          "Không thể tải mô hình nhận diện. Vui lòng thử tải lại trang."
        );
        enqueueSnackbar("Lỗi tải mô hình nhận diện", { variant: "error" });
      }
    };
    initModels();
  }, [enqueueSnackbar]); // Run only once on mount

  // 2. Handle camera state changes
  const handleUserMedia = () => {
    setCameraReady(true);
    setCameraError(null); // Clear previous camera error
  };

  const handleUserMediaError = (error) => {
    console.error("[FaceComponent] Camera error:", error);
    setCameraReady(false);
    const errorMsg =
      "Không thể truy cập camera. Vui lòng cấp quyền và thử lại.";
    setCameraError(errorMsg);
    enqueueSnackbar(errorMsg, { variant: "error" });
  };

  // 3. Real-time landmark drawing effect
  useEffect(() => {
    let animationFrameId;

    const runFaceDetection = async () => {
      if (
        webcamRef.current &&
        webcamRef.current.video &&
        canvasRef.current &&
        modelsLoaded &&
        cameraReady &&
        showLandmarks &&
        !isProcessing
      ) {
        const video = webcamRef.current.video;
        const canvas = canvasRef.current;

        if (video.readyState < 3) {
          // Wait until video has enough data
          return;
        }

        const displaySize = {
          width: video.videoWidth,
          height: video.videoHeight,
        };
        if (
          canvas.width !== displaySize.width ||
          canvas.height !== displaySize.height
        ) {
          faceapi.matchDimensions(canvas, displaySize);
        }

        try {
          const detections = await faceapi
            .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
            .withFaceLandmarks();

          const ctx = canvas.getContext("2d");
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          if (detections) {
            const resizedDetections = faceapi.resizeResults(
              detections,
              displaySize
            );
            faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);
          } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
          }
        } catch (error) {
          // Don't spam console if detection fails occasionally
          // console.error("Error in real-time detection loop:", error);
        }
      }
    };

    const detectionLoop = () => {
      runFaceDetection().finally(() => {
        animationFrameId = requestAnimationFrame(detectionLoop);
      });
    };

    // Start loop only when everything is ready and landmarks are enabled
    if (
      modelsLoaded &&
      cameraReady &&
      showLandmarks &&
      !modelLoadingError &&
      !cameraError
    ) {
      animationFrameId = requestAnimationFrame(detectionLoop);
    } else {
      // Clear canvas if conditions are not met
      if (canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }

    // Cleanup function
    return () => {
      try {
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
        }
        // Clear canvas if it exists
        if (canvasRef.current) {
          const canvas = canvasRef.current;
          const ctx = canvas.getContext("2d");
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      } catch (error) {
        console.error("[FaceComponent] Error during cleanup:", error);
        // Silently handle cleanup errors
      }
    };
  }, [
    modelsLoaded,
    cameraReady,
    showLandmarks,
    isProcessing,
    modelLoadingError,
    cameraError,
  ]);

  // 4. Capture and detect face
  const captureImage = async () => {
    // Basic checks
    if (!webcamRef.current || !cameraReady || isProcessing || !modelsLoaded) {
      let reason = "Chưa sẵn sàng";
      if (!cameraReady) reason = "Camera chưa sẵn sàng";
      else if (isProcessing) reason = "Đang xử lý";
      else if (!modelsLoaded) reason = "Mô hình chưa tải xong";
      enqueueSnackbar(`Không thể chụp ảnh: ${reason}`, { variant: "warning" });
      return;
    }
    if (capturedImages.length >= requiredImages) {
      enqueueSnackbar(`Đã chụp đủ ${requiredImages} ảnh.`, { variant: "info" });
      return;
    }

    setIsProcessing(true);
    setCaptureError(""); // Clear previous capture error

    try {
      const imageSrc = webcamRef.current.getScreenshot({
        width: videoConstraints.width.ideal,
        height: videoConstraints.height.ideal,
      });
      if (!imageSrc) {
        throw new Error("Không thể chụp ảnh từ webcam.");
      }

      // Perform face detection
      const detections = await detectFace(imageSrc);

      if (!detections || !detections.descriptor) {
        console.warn(
          "[FaceComponent] Face detection failed or no descriptor found."
        );
        enqueueSnackbar(
          "Không phát hiện được khuôn mặt rõ ràng. Hãy thử lại.",
          { variant: "warning" }
        );
        setIsProcessing(false); // Allow retry
        return;
      }

      // Store image and descriptor
      const newImageData = {
        img: imageSrc,
        descriptor: Array.from(detections.descriptor), // Ensure serializable
      };
      const updatedImages = [...capturedImages, newImageData];
      setCapturedImages(updatedImages);

      enqueueSnackbar(`Đã chụp ảnh ${updatedImages.length}/${requiredImages}`, {
        variant: "success",
        autoHideDuration: 1500,
      });

      // If enough images captured, notify parent immediately
      if (updatedImages.length >= requiredImages) {
        onFaceDataCapture(updatedImages); // Pass all captured data
        enqueueSnackbar(`Đã chụp đủ ${requiredImages} ảnh!`, {
          variant: "info",
        });
      }
    } catch (err) {
      console.error("[FaceComponent] Error capturing image:", err);
      const errorMsg = "Lỗi khi chụp ảnh. Vui lòng thử lại.";
      setCaptureError(errorMsg);
      enqueueSnackbar(errorMsg, { variant: "error" });
    } finally {
      setIsProcessing(false);
    }
  };

  // 5. Reset capture
  const resetCapture = () => {
    setCapturedImages([]);
    setCaptureError("");
    // Notify parent that data is cleared (optional, depends on parent needs)
    // onFaceDataCapture(null); or onFaceDataCapture([]);
    enqueueSnackbar("Đã xóa ảnh đã chụp, bạn có thể chụp lại.", {
      variant: "info",
    });
  };

  // --- Render Logic ---

  const renderCameraView = () => (
    <Paper
      elevation={2}
      sx={{
        position: "relative",
        width: "100%",
        maxWidth: `${videoConstraints.width.ideal}px`,
        aspectRatio: `${videoConstraints.width.ideal} / ${videoConstraints.height.ideal}`,
        margin: "16px auto",
        overflow: "hidden",
        bgcolor: "grey.200",
        border: cameraError ? "2px solid red" : "1px solid",
        borderColor: "divider",
      }}
    >
      <Suspense
        fallback={
          <Box
            sx={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
            }}
          >
            <CircularProgress />
          </Box>
        }
      >
        <Webcam
          audio={false}
          ref={webcamRef}
          screenshotFormat="image/jpeg"
          videoConstraints={videoConstraints}
          onUserMedia={handleUserMedia}
          onUserMediaError={handleUserMediaError}
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
        <canvas
          ref={canvasRef}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            display: showLandmarks ? "block" : "none",
          }}
        />
      </Suspense>

      {/* Loading/Error Overlay */}
      {(!modelsLoaded || !cameraReady || cameraError || modelLoadingError) && (
        <Box
          sx={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            color: "white",
            textAlign: "center",
            p: 2,
          }}
        >
          <CircularProgress color="inherit" sx={{ mb: 2 }} />
          {modelLoadingError && (
            <Typography variant="body2" color="error">
              {modelLoadingError}
            </Typography>
          )}
          {cameraError && (
            <Typography variant="body2" color="error">
              {cameraError}
            </Typography>
          )}
          {!modelLoadingError && !cameraError && !modelsLoaded && (
            <Typography>Đang tải mô hình...</Typography>
          )}
          {!modelLoadingError &&
            !cameraError &&
            modelsLoaded &&
            !cameraReady && <Typography>Đang khởi động camera...</Typography>}
        </Box>
      )}
    </Paper>
  );

  const renderCaptureControls = () => (
    <Box sx={{ textAlign: "center", mt: 2 }}>
      <FormControlLabel
        control={
          <Switch
            checked={showLandmarks}
            onChange={(e) => setShowLandmarks(e.target.checked)}
            size="small"
          />
        }
        label="Hiện Landmark"
        sx={{ mb: 1, display: "block" }}
      />
      <Button
        variant="contained"
        color="primary"
        startIcon={<CameraAlt />}
        onClick={captureImage}
        disabled={
          !cameraReady ||
          !modelsLoaded ||
          isProcessing ||
          capturedImages.length >= requiredImages ||
          !!cameraError ||
          !!modelLoadingError
        }
        sx={{ mb: 1, mr: 1 }}
      >
        {isProcessing ? (
          <CircularProgress size={24} color="inherit" />
        ) : (
          `Chụp ảnh (${capturedImages.length}/${requiredImages})`
        )}
      </Button>
      <Button
        variant="outlined"
        color="warning"
        startIcon={<Replay />}
        onClick={resetCapture}
        disabled={capturedImages.length === 0 || isProcessing}
        sx={{ mb: 1 }}
      >
        Chụp lại
      </Button>
      {captureError && (
        <Alert severity="error" sx={{ mt: 2, textAlign: "left" }}>
          {captureError}
        </Alert>
      )}
    </Box>
  );

  const renderImagePreviews = () =>
    capturedImages.length > 0 && (
      <Box sx={{ mt: 2, textAlign: "center" }}>
        <Typography variant="caption" display="block" gutterBottom>
          Ảnh đã chụp:
        </Typography>
        <Stack
          direction="row"
          spacing={1}
          justifyContent="center"
          flexWrap="wrap"
        >
          {capturedImages.map((imgData, index) => (
            <Avatar
              key={index}
              src={imgData.img}
              sx={{ width: 56, height: 56 }}
            />
          ))}
          {/* Placeholders for remaining slots */}
          {[...Array(Math.max(0, requiredImages - capturedImages.length))].map(
            (_, i) => (
              <Avatar
                key={`placeholder-${i}`}
                sx={{ width: 56, height: 56, bgcolor: "grey.300" }}
              >
                <Person />
              </Avatar>
            )
          )}
        </Stack>
      </Box>
    );

  // --- Main Component Render ---
  return (
    <Box>
      {/* Show general loading/error before camera */}
      {!modelsLoaded && !modelLoadingError && (
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            p: 2,
          }}
        >
          <CircularProgress size={20} sx={{ mr: 1 }} />
          <Typography>Đang tải mô hình nhận diện...</Typography>
        </Box>
      )}
      {modelLoadingError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {modelLoadingError}
        </Alert>
      )}

      {/* Render Camera and Controls once models attempt to load */}
      {modelsLoaded && !modelLoadingError && (
        <>
          {renderCameraView()}
          {renderCaptureControls()}
          {renderImagePreviews()}
        </>
      )}
      {/* Optional: Add a success message when all images are captured */}
      {capturedImages.length >= requiredImages && (
        <Alert
          severity="success"
          icon={<CheckCircleOutline fontSize="inherit" />}
          sx={{ mt: 2 }}
        >
          Đã chụp đủ {requiredImages} ảnh. Bạn có thể tiếp tục.
        </Alert>
      )}
    </Box>
  );
};

export default FaceRegistrationComponent;
