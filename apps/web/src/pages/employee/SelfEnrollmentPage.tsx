import React, { useState, useEffect, useRef } from 'react';
import {
  Button,
  Card,
  Typography,
  Alert,
  Segmented,
  Collapse,
  Space,
  Tag,
  Avatar,
  message,
} from 'antd';
import {
  CameraOutlined,
  UploadOutlined,
  CheckOutlined,
  CloseOutlined,
  PlusOutlined,
  UndoOutlined,
  LoadingOutlined,
  UserOutlined,
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

const { Title, Text } = Typography;

interface FaceSample {
  id: string;
  previewUrl: string;
  embedding: number[];
  quality: number;
  label: string;
}

const GUIDED_POSES = [
  { step: 1, title: 'Frontal', shortTitle: 'Frontal', desc: 'Look directly at the camera with a relaxed expression' },
  { step: 2, title: 'Frontal Smile', shortTitle: 'Smile', desc: 'Look directly at camera with a slight natural smile' },
  { step: 3, title: 'Turn Slightly Left', shortTitle: 'Left', desc: 'Turn head ~15° to your left so right cheek is visible' },
  { step: 4, title: 'Turn Slightly Right', shortTitle: 'Right', desc: 'Turn head ~15° to your right so left cheek is visible' },
  { step: 5, title: 'Slight Tilt', shortTitle: 'Tilt', desc: 'Tilt your chin slightly up or down to capture vertical angle' },
];

export const SelfEnrollmentPage: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'upload' | 'camera'>('upload');
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [currentReferenceFace, setCurrentReferenceFace] = useState<string | null>(null);

  // Upload flow
  const [uploadSamples, setUploadSamples] = useState<FaceSample[]>([]);
  const [uploadProcessing, setUploadProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Camera flow
  const [cameraSamples, setCameraSamples] = useState<FaceSample[]>([]);
  const [currentPoseIdx, setCurrentPoseIdx] = useState(0);
  const [lastCapturedPose, setLastCapturedPose] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [liveFaceDetected, setLiveFaceDetected] = useState(false);
  const [liveQuality, setLiveQuality] = useState(0);
  const [capturingPose, setCapturingPose] = useState(false);

  const [lastDetectedFormat, setLastDetectedFormat] = useState<string>('Standard');

  // ── Fetch enrolled face preview ──────────────────────────────────────────
  useEffect(() => {
    if (user?.face_enrolled) {
      api.get('/users/self/face-template')
        .then((res) => { if (res.data?.data?.referenceImage) setCurrentReferenceFace(res.data.data.referenceImage); })
        .catch(console.warn);
    }
  }, [user?.face_enrolled]);

  useEffect(() => { return () => { stopCamera(); }; }, []);

  // ── Camera helpers ───────────────────────────────────────────────────────
  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraActive(false);
    setCameraReady(false);
    setLiveFaceDetected(false);
  };

  const startCamera = async () => {
    setCameraError(null);
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
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
    } catch {
      setCameraError('Unable to access camera. Check permissions or upload photos instead.');
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

  // Live face detection loop — runs every 6 frames to keep mobile smooth
  useEffect(() => {
    let animId: number;
    let frameCounter = 0;
    const checkFrame = async () => {
      if (videoRef.current && videoRef.current.readyState === 4 && cameraReady && cameraActive) {
        frameCounter++;
        if (frameCounter % 6 === 0) {
          try {
            const detection = await analyzeVideoFrame(videoRef.current);
            setLiveFaceDetected(detection.faceCount === 1);
            if (detection.faceCount === 1) setLiveQuality(detection.quality);
          } catch {
            setLiveFaceDetected(false);
          }
        }
      }
      animId = requestAnimationFrame(checkFrame);
    };
    if (cameraActive && cameraReady) animId = requestAnimationFrame(checkFrame);
    return () => cancelAnimationFrame(animId);
  }, [cameraActive, cameraReady]);

  const handleTabChange = (key: 'upload' | 'camera') => {
    if (key === 'camera') startCamera();
    else stopCamera();
    setActiveTab(key);
  };

  // ── Upload handler ───────────────────────────────────────────────────────
  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (uploadSamples.length >= 5) { message.warning('Maximum of 5 photos reached.'); return; }
    setUploadProcessing(true);
    setStatusMessage('Analyzing photo...');
    for (let i = 0; i < files.length; i++) {
      if (uploadSamples.length + i >= 5) { message.warning('Maximum 5 photos reached.'); break; }
      try {
        const result = await analyzeImageFile(files[i], (msg) => setStatusMessage(msg));
        setLastDetectedFormat(result.converted ? 'HEIC Converted' : files[i].type || 'JPG');
        const newSample: FaceSample = {
          id: `upload-${Date.now()}-${Math.random()}`,
          previewUrl: result.previewUrl,
          embedding: result.embedding,
          quality: Math.round(result.quality * 100),
          label: `Photo ${uploadSamples.length + i + 1}`,
        };
        setUploadSamples((prev) => (prev.length >= 5 ? prev : [...prev, newSample]));
      } catch (err: any) {
        message.error(err.message || 'No face detected in selected photo');
      }
    }
    setUploadProcessing(false);
    setStatusMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Camera capture handler ───────────────────────────────────────────────
  const handleCapturePose = async () => {
    if (!videoRef.current || !cameraActive) return;
    setCapturingPose(true);
    try {
      const detection = await analyzeVideoFrame(videoRef.current);
      if (detection.faceCount === 0) { message.warning('Position your face inside the frame'); return; }
      if (detection.faceCount > 1) { message.warning('Multiple faces detected. Keep only your face in frame.'); return; }
      const previewBase64 = captureVideoFrameAsBase64(videoRef.current);
      const poseInfo = GUIDED_POSES[currentPoseIdx] || { title: `Pose ${cameraSamples.length + 1}`, shortTitle: `Pose ${cameraSamples.length + 1}`, desc: '' };
      const newSample: FaceSample = {
        id: `camera-pose-${currentPoseIdx + 1}-${Date.now()}`,
        previewUrl: previewBase64,
        embedding: detection.embedding,
        quality: Math.round(detection.quality * 100),
        label: poseInfo.shortTitle,
      };
      setCameraSamples((prev) => [...prev, newSample]);
      setLastCapturedPose(poseInfo.shortTitle);
      setTimeout(() => setLastCapturedPose(null), 2000);
      if (currentPoseIdx < GUIDED_POSES.length - 1) setCurrentPoseIdx((p) => p + 1);
    } catch { message.error('Failed to capture pose'); }
    finally { setCapturingPose(false); }
  };

  const handleResetCameraPoses = () => {
    setCameraSamples([]);
    setCurrentPoseIdx(0);
    setLastCapturedPose(null);
  };

  // ── Save enrollment ──────────────────────────────────────────────────────
  const handleSaveEnrollment = async (samplesToSave: FaceSample[]) => {
    if (samplesToSave.length === 0) { message.error('Please capture or upload at least 1 face photo.'); return; }
    setSubmitting(true);
    try {
      const centroidEmbedding = buildCentroidTemplate(samplesToSave.map((s) => s.embedding));
      await api.post('/users/self/enroll-face', {
        embedding: centroidEmbedding,
        modelName: '@vladmandic/human',
        modelVersion: '3.2.0',
        referenceImage: samplesToSave[0].previewUrl,
      });
      message.success('Face reference updated');
      stopCamera();
      await refreshUser();
      navigate('/employee/attendance/check-in');
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Failed to save face reference');
    } finally { setSubmitting(false); }
  };

  // ── Computed values ──────────────────────────────────────────────────────
  const cameraOutlineState = cameraError ? 'error'
    : liveFaceDetected && liveQuality >= 0.65 ? 'ready'
    : liveFaceDetected ? 'detected'
    : 'neutral';

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{
      maxWidth: 500,
      margin: '0 auto',
      padding: '12px 16px calc(env(safe-area-inset-bottom, 20px) + 80px)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif',
    }}>

      {/* ─── Page Header ─── */}
      <div style={{ marginBottom: 16 }}>
        <Title level={3} style={{ margin: '0 0 4px', fontWeight: 700, letterSpacing: -0.5, fontSize: 26 }}>
          Face Registration
        </Title>
        <Text type="secondary" style={{ fontSize: 14, lineHeight: '1.4' }}>
          Create or update your face reference for secure attendance verification.
        </Text>
      </div>

      {/* ─── Status Banner — only show when a face is already enrolled ─── */}
      {user?.face_enrolled && (
        <div style={{
          overflow: 'hidden',
          maxHeight: activeTab === 'camera' ? 0 : 120,
          opacity: activeTab === 'camera' ? 0 : 1,
          marginBottom: activeTab === 'camera' ? 0 : 12,
          transition: 'max-height 0.28s cubic-bezier(0.4,0,0.2,1), opacity 0.2s ease, margin-bottom 0.28s ease',
        }}>
          <Card
            size="small"
            styles={{ body: { padding: '10px 14px' } }}
            style={{ borderRadius: 14, border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {currentReferenceFace ? (
                <img src={currentReferenceFace} alt="Reference face"
                  style={{ width: 50, height: 50, borderRadius: 11, objectFit: 'cover', flexShrink: 0, border: '1px solid rgba(0,0,0,0.06)' }} />
              ) : (
                <Avatar size={50} icon={<UserOutlined />} style={{ borderRadius: 11, flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <Space size={6}>
                  <Text strong style={{ fontSize: 15 }}>Face reference</Text>
                  <Tag color="success" icon={<CheckOutlined />} style={{ margin: 0 }}>Active</Tag>
                </Space>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>Your biometric reference is already registered.</Text>
                </div>
              </div>
              <Button
                type="link"
                size="small"
                style={{ padding: '0 4px', whiteSpace: 'nowrap', fontWeight: 500 }}
                onClick={() => document.getElementById('reg-mode-selector')?.scrollIntoView({ behavior: 'smooth' })}
              >
                Update
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ─── Mode Selector (Segmented — smooth sliding pill, zero shake) ─── */}
      <div id="reg-mode-selector" style={{ marginBottom: 4 }}>
        <Segmented
          block
          size="large"
          value={activeTab}
          onChange={(val) => handleTabChange(val as 'upload' | 'camera')}
          options={[
            { label: <Space size={6}><UploadOutlined />Upload photos</Space>, value: 'upload' },
            { label: <Space size={6}><CameraOutlined />Use camera</Space>, value: 'camera' },
          ]}
          style={{ borderRadius: 12 }}
        />
        <Text type="secondary" style={{ fontSize: 12, display: 'block', textAlign: 'center', marginTop: 6, marginBottom: 16 }}>
          {activeTab === 'upload' ? 'Upload 1–5 clear face photos' : 'Capture 3–5 guided poses'}
        </Text>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* FLOW 1 — UPLOAD PHOTOS                                            */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'upload' && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif"
            multiple
            style={{ display: 'none' }}
            onChange={handleFilesSelected}
          />

          {/* Dragger-style upload zone */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
            style={{
              border: '1.5px dashed #d9d9d9',
              borderRadius: 16,
              background: '#fafafa',
              padding: '32px 16px',
              textAlign: 'center',
              cursor: 'pointer',
              outline: 'none',
              transition: 'border-color 0.18s ease, background 0.18s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#1677ff'; e.currentTarget.style.background = '#f0f7ff'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#d9d9d9'; e.currentTarget.style.background = '#fafafa'; }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#1677ff'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#d9d9d9'; }}
          >
            <div style={{ fontSize: 32, color: '#1677ff', marginBottom: 8 }}>
              {uploadProcessing ? <LoadingOutlined /> : <UploadOutlined />}
            </div>
            <Text strong style={{ display: 'block', fontSize: 15, marginBottom: 4 }}>Select face photos</Text>
            <Text type="secondary" style={{ fontSize: 13 }}>1–5 photos • JPG, PNG, WEBP, HEIC</Text>
            {statusMessage && (
              <Text style={{ display: 'block', marginTop: 8, fontSize: 12, color: '#1677ff', fontWeight: 500 }}>
                {statusMessage}
              </Text>
            )}
          </div>

          {/* Uploaded photo grid */}
          {uploadSamples.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <Text strong>{uploadSamples.length} of 5 photos</Text>
                <Button type="link" danger size="small" style={{ padding: 0 }} onClick={() => setUploadSamples([])}>
                  Clear all
                </Button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {uploadSamples.map((sample, idx) => (
                  <div
                    key={sample.id}
                    style={{ position: 'relative', aspectRatio: '1/1', borderRadius: 12, overflow: 'hidden', border: '1.5px solid #e2e8f0', background: '#0f172a' }}
                  >
                    <img src={sample.previewUrl} alt={sample.label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setUploadSamples((p) => p.filter((s) => s.id !== sample.id)); }}
                      style={{ position: 'absolute', top: 4, right: 4, width: 26, height: 26, borderRadius: '50%', background: 'rgba(0,0,0,0.65)', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, cursor: 'pointer', transition: 'background 0.15s' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#ff4d4f'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.65)'; }}
                    >
                      <CloseOutlined />
                    </button>
                    {idx === 0 && (
                      <span style={{ position: 'absolute', bottom: 4, left: 4, background: 'rgba(0,0,0,0.68)', color: '#fff', fontSize: 10, fontWeight: 500, padding: '2px 6px', borderRadius: 6 }}>
                        Primary
                      </span>
                    )}
                  </div>
                ))}

                {uploadSamples.length < 5 && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{ aspectRatio: '1/1', borderRadius: 12, border: '1.5px dashed #d9d9d9', background: '#fafafa', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, color: '#8c8c8c', fontSize: 12, cursor: 'pointer', transition: 'all 0.15s ease' }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#1677ff'; e.currentTarget.style.color = '#1677ff'; e.currentTarget.style.background = '#f0f7ff'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#d9d9d9'; e.currentTarget.style.color = '#8c8c8c'; e.currentTarget.style.background = '#fafafa'; }}
                  >
                    <PlusOutlined style={{ fontSize: 20 }} />
                    <span>Add photo</span>
                  </button>
                )}
              </div>

              <Button
                type="primary"
                size="large"
                block
                loading={submitting}
                disabled={uploadSamples.length === 0 || submitting}
                onClick={() => handleSaveEnrollment(uploadSamples)}
                style={{ marginTop: 18, height: 50, borderRadius: 14, fontWeight: 600, fontSize: 16, background: '#16a34a', borderColor: '#16a34a' }}
              >
                Save Face Reference
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* FLOW 2 — GUIDED CAMERA CAPTURE                                    */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'camera' && (
        <div>
          {cameraError && (
            <Alert
              message={cameraError}
              type="error"
              showIcon
              style={{ borderRadius: 12, marginBottom: 12 }}
            />
          )}

          {/* Step progress dots only — no header text */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, padding: '0 4px' }}>
            {GUIDED_POSES.map((pose, i) => {
              const isCompleted = i < cameraSamples.length;
              const isActive = i === currentPoseIdx && !isCompleted;
              return (
                <React.Fragment key={pose.step}>
                  <div style={{
                    width: 26, height: 26, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 600, flexShrink: 0,
                    background: isCompleted ? '#16a34a' : isActive ? '#1677ff' : '#f0f0f0',
                    color: isCompleted || isActive ? '#fff' : '#bfbfbf',
                    border: isActive ? '2px solid rgba(22,119,255,0.25)' : '1px solid transparent',
                    boxShadow: isActive ? '0 0 0 3px rgba(22,119,255,0.15)' : 'none',
                    transition: 'all 0.22s ease',
                  }}>
                    {isCompleted ? <CheckOutlined style={{ fontSize: 10 }} /> : pose.step}
                  </div>
                  {i < GUIDED_POSES.length - 1 && (
                    <div style={{
                      flex: 1, height: 2,
                      background: i < cameraSamples.length ? '#16a34a' : '#f0f0f0',
                      margin: '0 4px',
                      transition: 'background 0.22s ease',
                    }} />
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* Camera viewport — no status pill */}
          <div className="apple-face-reg-camera-box" style={{ marginBottom: 12 }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="apple-face-reg-video"
            />
            <div className={`apple-face-reg-guide ${cameraOutlineState}`} />
          </div>

          {/* Capture button */}
          <Button
            type="primary"
            size="large"
            block
            icon={capturingPose ? <LoadingOutlined /> : <CameraOutlined />}
            disabled={!cameraActive || !liveFaceDetected || capturingPose || cameraSamples.length >= 5}
            onClick={handleCapturePose}
            style={{ height: 52, borderRadius: 14, fontWeight: 600, fontSize: 16, marginBottom: 10 }}
          >
            {capturingPose ? 'Capturing...' : 'Capture'}
          </Button>

          {/* Restart only — no "Upload instead" */}
          {cameraSamples.length > 0 && (
            <Button
              block
              icon={<UndoOutlined />}
              onClick={handleResetCameraPoses}
              style={{ height: 44, borderRadius: 10, marginBottom: 0 }}
            >
              Restart
            </Button>
          )}

          {/* Captured poses thumbnail strip */}
          {cameraSamples.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <Text strong style={{ fontSize: 13 }}>
                  {cameraSamples.length} of 5 poses captured
                </Text>
                <Text style={{ fontSize: 12, color: cameraSamples.length >= 3 ? '#16a34a' : '#8c8c8c' }}>
                  {cameraSamples.length >= 3 ? '✓ Ready to save' : 'Capture at least 3'}
                </Text>
              </div>

              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, WebkitOverflowScrolling: 'touch' }}>
                {cameraSamples.map((sample) => (
                  <div
                    key={sample.id}
                    style={{ width: 60, height: 60, borderRadius: 10, overflow: 'hidden', position: 'relative', flexShrink: 0, border: '1.5px solid #16a34a', background: '#000' }}
                  >
                    <img src={sample.previewUrl} alt={sample.label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    <span style={{ position: 'absolute', bottom: 2, right: 2, width: 16, height: 16, borderRadius: '50%', background: '#16a34a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9 }}>
                      <CheckOutlined />
                    </span>
                  </div>
                ))}
              </div>

              {cameraSamples.length >= 3 && (
                <Button
                  type="primary"
                  size="large"
                  block
                  loading={submitting}
                  disabled={submitting}
                  onClick={() => handleSaveEnrollment(cameraSamples)}
                  style={{ marginTop: 14, height: 50, borderRadius: 14, fontWeight: 600, fontSize: 16, background: '#16a34a', borderColor: '#16a34a' }}
                >
                  Save Face Reference
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Technical Details (antd Collapse — replaces custom accordion) ─── */}
      <Collapse
        ghost
        style={{ marginTop: 24, borderTop: '1px solid #f0f0f0', paddingTop: 8 }}
        items={[{
          key: 'tech',
          label: <Text type="secondary" style={{ fontSize: 13 }}>Technical details</Text>,
          children: (
            <div style={{ background: '#fafafa', borderRadius: 10, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#595959' }}>
              {[
                ['Detection confidence', liveFaceDetected ? `${Math.round(liveQuality * 100)}%` : 'N/A'],
                ['Image format', lastDetectedFormat],
                ['Converted format', 'JPEG (Standard RGB)'],
                ['Template status', user?.face_enrolled ? 'Active' : 'Pending enrollment'],
                ['Centroid', '1024-D Centroid'],
                ['Model', '@vladmandic/human v3.2.0'],
              ].map(([label, value]) => (
                <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{label}</span>
                  <Text strong style={{ fontSize: 12, color: '#141414' }}>{value}</Text>
                </div>
              ))}
            </div>
          ),
        }]}
      />
    </div>
  );
};
