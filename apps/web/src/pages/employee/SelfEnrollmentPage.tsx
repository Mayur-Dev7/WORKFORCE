import React, { useState, useEffect, useRef } from 'react';
import { message } from 'antd';
import {
  CameraOutlined,
  UploadOutlined,
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
  PlusOutlined,
  UndoOutlined,
  LoadingOutlined,
  RightOutlined,
  DownOutlined,
  UserOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../services/api.js';
import {
  analyzeImageFile,
  analyzeVideoFrame,
  captureVideoFrameAsBase64,
  buildCentroidTemplate,
} from '../../services/face.client.js';

interface FaceSample {
  id: string;
  previewUrl: string;
  embedding: number[];
  quality: number;
  label: string;
}

const GUIDED_POSES = [
  { step: 1, title: 'Frontal Neutral', shortTitle: 'Frontal', desc: 'Look directly at the camera with a relaxed expression' },
  { step: 2, title: 'Frontal Smile', shortTitle: 'Frontal Smile', desc: 'Look directly at camera with a slight natural smile' },
  { step: 3, title: 'Turn Slightly Left', shortTitle: 'Slight left', desc: 'Turn head ~15° to your left so right cheek is visible' },
  { step: 4, title: 'Turn Slightly Right', shortTitle: 'Slight right', desc: 'Turn head ~15° to your right so left cheek is visible' },
  { step: 5, title: 'Slight Tilt Up/Down', shortTitle: 'Slight up/down', desc: 'Tilt your chin slightly up or down to capture vertical angle' },
];

export const SelfEnrollmentPage: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'upload' | 'camera'>('upload');
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Current enrolled face
  const [currentReferenceFace, setCurrentReferenceFace] = useState<string | null>(null);
  const [, setLoadingCurrentFace] = useState(false);

  // Uploaded samples (up to 5 photos)
  const [uploadSamples, setUploadSamples] = useState<FaceSample[]>([]);
  const [uploadProcessing, setUploadProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Guided camera samples (up to 5 poses)
  const [cameraSamples, setCameraSamples] = useState<FaceSample[]>([]);
  const [currentPoseIdx, setCurrentPoseIdx] = useState(0);
  const [lastCapturedPose, setLastCapturedPose] = useState<string | null>(null);

  // Camera video stream
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Live face detection feedback on camera
  const [liveFaceDetected, setLiveFaceDetected] = useState(false);
  const [liveQuality, setLiveQuality] = useState(0);
  const [capturingPose, setCapturingPose] = useState(false);

  // Technical details disclosure
  const [techOpen, setTechOpen] = useState(false);
  const [lastDetectedFormat, setLastDetectedFormat] = useState<string>('Standard');

  // Fetch current enrolled face if user.face_enrolled is true
  useEffect(() => {
    if (user?.face_enrolled) {
      setLoadingCurrentFace(true);
      api
        .get('/users/self/face-template')
        .then((res) => {
          if (res.data?.data?.referenceImage) {
            setCurrentReferenceFace(res.data.data.referenceImage);
          }
        })
        .catch((err) => {
          console.warn('Could not fetch existing face template', err);
        })
        .finally(() => setLoadingCurrentFace(false));
    }
  }, [user?.face_enrolled]);

  // Clean up camera stream on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setCameraReady(false);
    setLiveFaceDetected(false);
  };

  const startCamera = async () => {
    setCameraError(null);
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
      });
      streamRef.current = stream;
      setCameraActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(console.error);
          setCameraReady(true);
        };
      }
    } catch (err: any) {
      console.error('Camera access failed:', err);
      setCameraError('Unable to access camera. Please check permissions or upload photos instead.');
    }
  };

  // Re-bind stream if videoRef mounts while cameraActive
  useEffect(() => {
    if (cameraActive && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(console.error);
      setCameraReady(true);
    }
  }, [cameraActive]);

  // Live face detection loop for camera
  useEffect(() => {
    let animId: number;
    let frameCounter = 0;

    const checkFrame = async () => {
      if (
        videoRef.current &&
        videoRef.current.readyState === 4 &&
        cameraReady &&
        cameraActive
      ) {
        frameCounter++;
        // Run inference every 6 frames to keep mobile UI super smooth
        if (frameCounter % 6 === 0) {
          try {
            const detection = await analyzeVideoFrame(videoRef.current);
            if (detection.faceCount === 1) {
              setLiveFaceDetected(true);
              setLiveQuality(detection.quality);
            } else {
              setLiveFaceDetected(false);
            }
          } catch {
            setLiveFaceDetected(false);
          }
        }
      }
      animId = requestAnimationFrame(checkFrame);
    };

    if (cameraActive && cameraReady) {
      animId = requestAnimationFrame(checkFrame);
    }
    return () => cancelAnimationFrame(animId);
  }, [cameraActive, cameraReady]);

  // Tab switch handler
  const handleTabChange = (key: 'upload' | 'camera') => {
    if (key === 'camera') {
      startCamera();
    } else {
      stopCamera();
    }
    setActiveTab(key);
  };

  // ---------------------------------------------------------------------------
  // Upload Handler (Supports multiple files up to 5)
  // ---------------------------------------------------------------------------
  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (uploadSamples.length >= 5) {
      message.warning('Maximum of 5 photos reached.');
      return;
    }

    setUploadProcessing(true);
    setStatusMessage('Analyzing photo...');

    for (let i = 0; i < files.length; i++) {
      if (uploadSamples.length + i >= 5) {
        message.warning('Maximum 5 photos reached.');
        break;
      }
      const file = files[i];
      try {
        const result = await analyzeImageFile(file, (msg) => setStatusMessage(msg));
        setLastDetectedFormat(result.converted ? 'HEIC Converted' : file.type || 'JPG');
        const newSample: FaceSample = {
          id: `upload-${Date.now()}-${Math.random()}`,
          previewUrl: result.previewUrl,
          embedding: result.embedding,
          quality: Math.round(result.quality * 100),
          label: `Photo ${uploadSamples.length + i + 1}`,
        };

        setUploadSamples((prev) => {
          if (prev.length >= 5) return prev;
          return [...prev, newSample];
        });
      } catch (err: any) {
        message.error(err.message || 'No face detected in selected photo');
      }
    }

    setUploadProcessing(false);
    setStatusMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveUploadSample = (id: string) => {
    setUploadSamples((prev) => prev.filter((s) => s.id !== id));
  };

  // ---------------------------------------------------------------------------
  // Guided Camera Poses Handler (Capture 3 to 5 guided poses)
  // ---------------------------------------------------------------------------
  const handleCapturePose = async () => {
    if (!videoRef.current || !cameraActive) return;

    setCapturingPose(true);
    try {
      const detection = await analyzeVideoFrame(videoRef.current);
      if (detection.faceCount === 0) {
        message.warning('Position your face inside the frame');
        setCapturingPose(false);
        return;
      }
      if (detection.faceCount > 1) {
        message.warning('Multiple faces detected. Keep only your face in frame.');
        setCapturingPose(false);
        return;
      }

      const previewBase64 = captureVideoFrameAsBase64(videoRef.current);
      const poseInfo = GUIDED_POSES[currentPoseIdx] || { title: `Pose ${cameraSamples.length + 1}`, shortTitle: `Pose ${cameraSamples.length + 1}` };

      const newSample: FaceSample = {
        id: `camera-pose-${currentPoseIdx + 1}-${Date.now()}`,
        previewUrl: previewBase64,
        embedding: detection.embedding,
        quality: Math.round(detection.quality * 100),
        label: poseInfo.shortTitle || poseInfo.title,
      };

      const updated = [...cameraSamples, newSample];
      setCameraSamples(updated);
      setLastCapturedPose(poseInfo.shortTitle || poseInfo.title);
      setTimeout(() => setLastCapturedPose(null), 2000);

      if (currentPoseIdx < GUIDED_POSES.length - 1) {
        setCurrentPoseIdx((prev) => prev + 1);
      }
    } catch {
      message.error('Failed to capture pose');
    } finally {
      setCapturingPose(false);
    }
  };

  const handleResetCameraPoses = () => {
    setCameraSamples([]);
    setCurrentPoseIdx(0);
    setLastCapturedPose(null);
  };

  // ---------------------------------------------------------------------------
  // Build Centroid Template & Submit Enrollment
  // ---------------------------------------------------------------------------
  const handleSaveEnrollment = async (samplesToSave: FaceSample[]) => {
    if (samplesToSave.length === 0) {
      message.error('Please capture or upload at least 1 face photo (3 to 5 recommended).');
      return;
    }

    setSubmitting(true);
    try {
      // Average all embeddings into single normalized centroid vector
      const centroidEmbedding = buildCentroidTemplate(samplesToSave.map((s) => s.embedding));
      const primaryPhoto = samplesToSave[0].previewUrl;

      await api.post('/users/self/enroll-face', {
        embedding: centroidEmbedding,
        modelName: '@vladmandic/human',
        modelVersion: '3.2.0',
        referenceImage: primaryPhoto,
      });

      message.success('Face reference updated');
      stopCamera();
      await refreshUser();
      navigate('/employee/attendance/check-in');
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Failed to save face reference');
    } finally {
      setSubmitting(false);
    }
  };

  const currentPose = GUIDED_POSES[currentPoseIdx] || GUIDED_POSES[0];

  // Camera Outline State
  const cameraOutlineState = cameraError
    ? 'error'
    : liveFaceDetected && liveQuality >= 0.65
    ? 'ready'
    : liveFaceDetected
    ? 'detected'
    : 'neutral';

  // Camera Guidance Text
  const getCameraGuidanceText = () => {
    if (capturingPose) return 'Capturing...';
    if (lastCapturedPose) return `✓ ${lastCapturedPose} captured`;
    if (!cameraReady) return 'Starting camera...';
    if (!liveFaceDetected) return 'Position your face inside the frame';
    if (liveQuality < 0.6) return 'Center your face';
    return '✓ Face detected';
  };

  return (
    <div className="apple-face-reg-container">
      {/* ─── Page Title Header (Clean, HIG hierarchy) ─── */}
      <div className="apple-face-reg-header">
        <h1 className="apple-face-reg-title">Face Registration</h1>
        <p className="apple-face-reg-subtitle">
          Create or update your face reference for secure attendance verification.
        </p>
      </div>

      {/* ─── Reference Face Status (Simplified, no technical clutter) ─── */}
      {/* Only show when not in active camera mode to prioritize the live camera */}
      {activeTab !== 'camera' && (
        <>
          {user?.face_enrolled ? (
            <div className="apple-face-reg-ref-card">
              <div className="apple-face-reg-ref-row">
                {currentReferenceFace ? (
                  <img
                    src={currentReferenceFace}
                    alt="Reference face"
                    className="apple-face-reg-ref-thumb"
                  />
                ) : (
                  <div className="apple-face-reg-ref-thumb-placeholder">
                    <UserOutlined />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>Face reference</span>
                    <span style={{ fontSize: 13, color: '#16a34a', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <CheckOutlined style={{ fontSize: 11 }} /> Active
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
                    Your biometric reference is already registered.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById('reg-input-section');
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#0071e3',
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: 'pointer',
                    padding: '8px 4px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Update
                </button>
              </div>
            </div>
          ) : (
            <div
              style={{
                background: '#fffbeb',
                border: '1px solid #fef3c7',
                borderRadius: 14,
                padding: '12px 14px',
                marginBottom: 16,
                fontSize: 13,
                color: '#92400e',
              }}
            >
              Face reference required to enable attendance check-in.
            </div>
          )}
        </>
      )}

      {/* ─── Mode Selector (Two clean methods: Upload or Camera) ─── */}
      <div id="reg-input-section">
        <div className="apple-face-reg-tabs">
          <button
            type="button"
            className={`apple-face-reg-tab-btn ${activeTab === 'upload' ? 'active' : ''}`}
            onClick={() => handleTabChange('upload')}
          >
            <UploadOutlined style={{ fontSize: 15 }} />
            Upload photos
          </button>
          <button
            type="button"
            className={`apple-face-reg-tab-btn ${activeTab === 'camera' ? 'active' : ''}`}
            onClick={() => handleTabChange('camera')}
          >
            <CameraOutlined style={{ fontSize: 15 }} />
            Use camera
          </button>
        </div>
        <div className="apple-face-reg-tab-caption">
          {activeTab === 'upload' ? 'Upload 1–5 clear face photos' : 'Capture 3–5 guided poses'}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* FLOW 1: UPLOAD PHOTOS                                           */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'upload' && (
        <div>
          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif"
            multiple
            style={{ display: 'none' }}
            onChange={handleFilesSelected}
          />

          {/* Clean Upload Box */}
          <div
            className="apple-face-reg-upload-area"
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
            }}
          >
            <div className="apple-face-reg-upload-icon">
              {uploadProcessing ? <LoadingOutlined /> : <UploadOutlined />}
            </div>
            <div className="apple-face-reg-upload-title">Select face photos</div>
            <div className="apple-face-reg-upload-hint">1–5 photos • JPG, PNG, WEBP, HEIC</div>
            {statusMessage && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#0071e3', fontWeight: 500 }}>
                {statusMessage}
              </div>
            )}
          </div>

          {/* Upload Gallery Thumbnails */}
          {uploadSamples.length > 0 && (
            <div className="apple-face-reg-gallery">
              <div className="apple-face-reg-gallery-header">
                <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
                  {uploadSamples.length} of 5 photos
                </span>
                <button
                  type="button"
                  onClick={() => setUploadSamples([])}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    fontSize: 13,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  Clear all
                </button>
              </div>

              <div className="apple-face-reg-gallery-grid">
                {uploadSamples.map((sample, idx) => (
                  <div key={sample.id} className="apple-face-reg-thumb-card">
                    <img src={sample.previewUrl} alt={sample.label} />
                    <button
                      type="button"
                      className="apple-face-reg-thumb-del"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveUploadSample(sample.id);
                      }}
                      title="Remove photo"
                    >
                      <CloseOutlined />
                    </button>
                    {idx === 0 && <span className="apple-face-reg-thumb-badge">Primary</span>}
                  </div>
                ))}

                {uploadSamples.length < 5 && (
                  <button
                    type="button"
                    className="apple-face-reg-add-tile"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <PlusOutlined style={{ fontSize: 20 }} />
                    <span>Add photo</span>
                  </button>
                )}
              </div>

              <div style={{ marginTop: 18 }}>
                <button
                  type="button"
                  className="apple-face-reg-primary-btn success"
                  disabled={uploadSamples.length === 0 || submitting}
                  onClick={() => handleSaveEnrollment(uploadSamples)}
                >
                  {submitting ? <LoadingOutlined /> : null}
                  Save Face Reference
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* FLOW 2: FOCUSED CAMERA WORKFLOW                                 */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'camera' && (
        <div>
          {cameraError && (
            <div
              style={{
                background: '#fff1f2',
                border: '1px solid #fecdd3',
                borderRadius: 12,
                padding: '10px 14px',
                color: '#e11d48',
                fontSize: 13,
                marginBottom: 12,
              }}
            >
              {cameraError}
            </div>
          )}

          {/* Step & Pose Header */}
          <div className="apple-face-reg-camera-header">
            <div className="apple-face-reg-step-label">Step {Math.min(currentPoseIdx + 1, 5)} of 5</div>
            <h2 className="apple-face-reg-pose-name">{currentPose.shortTitle}</h2>
            <p className="apple-face-reg-pose-desc">{currentPose.desc}</p>
          </div>

          {/* Compact Pose Progress (● ─ ○ ─ ○ ─ ○ ─ ○) */}
          <div className="apple-face-reg-pose-progress">
            {GUIDED_POSES.map((pose, i) => {
              const isCompleted = i < cameraSamples.length;
              const isActive = i === currentPoseIdx && !isCompleted;
              return (
                <React.Fragment key={pose.step}>
                  <div className="apple-face-reg-pose-dot-wrap">
                    <div
                      className={`apple-face-reg-pose-dot ${
                        isCompleted ? 'completed' : isActive ? 'active' : 'upcoming'
                      }`}
                    >
                      {isCompleted ? <CheckOutlined style={{ fontSize: 10 }} /> : pose.step}
                    </div>
                  </div>
                  {i < GUIDED_POSES.length - 1 && (
                    <div
                      className={`apple-face-reg-pose-line ${
                        i < cameraSamples.length ? 'completed' : ''
                      }`}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* Live Camera Viewport */}
          <div className="apple-face-reg-camera-box">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="apple-face-reg-video"
            />

            {/* Clean Face Guidance Frame */}
            <div className={`apple-face-reg-guide ${cameraOutlineState}`} />

            {/* Concise Status Badge (Single message, no raw technical stats) */}
            <div className="apple-face-reg-status-pill">
              {getCameraGuidanceText()}
            </div>
          </div>

          {/* Primary Action Button (Clean: [ Capture ]) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              type="button"
              className="apple-face-reg-primary-btn"
              disabled={
                !cameraActive ||
                !liveFaceDetected ||
                capturingPose ||
                cameraSamples.length >= 5
              }
              onClick={handleCapturePose}
            >
              {capturingPose ? <LoadingOutlined /> : <CameraOutlined />}
              Capture
            </button>

            {/* Secondary Controls */}
            <div style={{ display: 'flex', gap: 8 }}>
              {cameraSamples.length > 0 && (
                <button
                  type="button"
                  className="apple-face-reg-secondary-btn"
                  onClick={handleResetCameraPoses}
                  style={{ flex: 1 }}
                >
                  <UndoOutlined style={{ marginRight: 6 }} />
                  Restart
                </button>
              )}
              <button
                type="button"
                className="apple-face-reg-secondary-btn"
                onClick={() => handleTabChange('upload')}
                style={{ flex: 1 }}
              >
                Upload photos
              </button>
            </div>
          </div>

          {/* Captured Poses Strip */}
          {cameraSamples.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
                  {cameraSamples.length} of 5 poses captured
                </span>
                <span style={{ fontSize: 12, color: cameraSamples.length >= 3 ? '#16a34a' : '#64748b' }}>
                  {cameraSamples.length >= 3 ? '✓ Ready to save' : 'Capture at least 3 poses'}
                </span>
              </div>

              <div className="apple-face-reg-poses-strip">
                {cameraSamples.map((sample) => (
                  <div key={sample.id} className="apple-face-reg-pose-item">
                    <img src={sample.previewUrl} alt={sample.label} />
                    <span className="apple-face-reg-pose-check">
                      <CheckOutlined />
                    </span>
                  </div>
                ))}
              </div>

              {/* Completion Action */}
              {cameraSamples.length >= 3 && (
                <div
                  style={{
                    marginTop: 14,
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: 14,
                    padding: '14px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#16a34a' }}>
                    ✓ {cameraSamples.length === 5 ? 'All photos captured' : 'Face reference ready'}
                  </div>
                  <div style={{ fontSize: 13, color: '#475569', marginTop: 2, marginBottom: 12 }}>
                    Your biometric reference is ready to be saved.
                  </div>
                  <button
                    type="button"
                    className="apple-face-reg-primary-btn success"
                    disabled={submitting}
                    onClick={() => handleSaveEnrollment(cameraSamples)}
                  >
                    {submitting ? <LoadingOutlined /> : null}
                    Save Face Reference
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Technical Details Disclosure (Progressive Disclosure) ─── */}
      <div className="apple-face-reg-tech-details">
        <div
          onClick={() => setTechOpen(!techOpen)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') setTechOpen(!techOpen);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            fontSize: 13,
            color: '#64748b',
            userSelect: 'none',
          }}
        >
          <span>Technical details</span>
          {techOpen ? <DownOutlined style={{ fontSize: 11 }} /> : <RightOutlined style={{ fontSize: 11 }} />}
        </div>

        {techOpen && (
          <div className="apple-face-reg-tech-content">
            <div className="apple-face-reg-tech-row">
              <span>Detection confidence</span>
              <span style={{ fontWeight: 600, color: '#0f172a' }}>
                {liveFaceDetected ? `${Math.round(liveQuality * 100)}%` : 'N/A'}
              </span>
            </div>
            <div className="apple-face-reg-tech-row">
              <span>Image format</span>
              <span style={{ fontWeight: 600, color: '#0f172a' }}>{lastDetectedFormat}</span>
            </div>
            <div className="apple-face-reg-tech-row">
              <span>Converted format</span>
              <span style={{ fontWeight: 600, color: '#0f172a' }}>JPEG (Standard RGB)</span>
            </div>
            <div className="apple-face-reg-tech-row">
              <span>Template status</span>
              <span style={{ fontWeight: 600, color: user?.face_enrolled ? '#16a34a' : '#64748b' }}>
                {user?.face_enrolled ? 'Active' : 'Pending enrollment'}
              </span>
            </div>
            <div className="apple-face-reg-tech-row">
              <span>Centroid</span>
              <span style={{ fontWeight: 600, color: '#0f172a' }}>1024-D Centroid</span>
            </div>
            <div className="apple-face-reg-tech-row">
              <span>Model</span>
              <span style={{ fontWeight: 600, color: '#0f172a' }}>@vladmandic/human v3.2.0</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
