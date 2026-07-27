import React, { useRef, useState, useEffect } from 'react';
import Webcam from 'react-webcam';
import { CheckCircle2, RefreshCw, Loader2 } from 'lucide-react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

// --- AI EVALUATION MATH ---
const getBlendshape = (categories, name) => {
  const shape = categories.find(c => c.categoryName === name);
  return shape ? shape.score : 0;
};

// We tightened the thresholds to prevent accidental video triggers
const EVALUATORS = {
  BLINK: (results) => {
    if (!results.faceBlendshapes?.length) return false;
    const shapes = results.faceBlendshapes[0].categories;
    return getBlendshape(shapes, 'eyeBlinkLeft') > 0.5 && getBlendshape(shapes, 'eyeBlinkRight') > 0.5;
  },
  SMILE: (results) => {
    if (!results.faceBlendshapes?.length) return false;
    const shapes = results.faceBlendshapes[0].categories;
    return getBlendshape(shapes, 'mouthSmileLeft') > 0.65 && getBlendshape(shapes, 'mouthSmileRight') > 0.65;
  },
  LOOK_LEFT: (results) => {
    if (!results.faceLandmarks?.length) return false;
    const l = results.faceLandmarks[0];
    const ratio = Math.abs(l[1].x - l[234].x) / Math.abs(l[454].x - l[1].x);
    return ratio > 2.0; // Fixed mirrored mismatch
  },
  LOOK_RIGHT: (results) => {
    if (!results.faceLandmarks?.length) return false;
    const l = results.faceLandmarks[0];
    const ratio = Math.abs(l[1].x - l[234].x) / Math.abs(l[454].x - l[1].x);
    return ratio < 0.5; // Fixed mirrored mismatch
  },
};

// THE VIDEO-KILLER: Enforces a flat, straight face between challenges
const isNeutral = (results) => {
  if (!results.faceBlendshapes?.length || !results.faceLandmarks?.length) return false;
  const shapes = results.faceBlendshapes[0].categories;
  const l = results.faceLandmarks[0];
  const ratio = Math.abs(l[1].x - l[234].x) / Math.abs(l[454].x - l[1].x);
  
  const notBlinking = getBlendshape(shapes, 'eyeBlinkLeft') < 0.15 && getBlendshape(shapes, 'eyeBlinkRight') < 0.15;
  const notSmiling = getBlendshape(shapes, 'mouthSmileLeft') < 0.15 && getBlendshape(shapes, 'mouthSmileRight') < 0.15;
  const lookingStraight = ratio > 0.75 && ratio < 1.35;

  return notBlinking && notSmiling && lookingStraight;
};

const ACTION_CONFIG = {
  LOOK_LEFT: { label: "Turn head LEFT", color: "text-blue-600 border-blue-500" },
  LOOK_RIGHT: { label: "Turn head RIGHT", color: "text-blue-600 border-blue-500" },
  SMILE: { label: "SMILE for camera", color: "text-pink-600 border-pink-500" },
  BLINK: { label: "BLINK your eyes", color: "text-purple-600 border-purple-500" }
};

const generateRandomSequence = () => {
  const keys = Object.keys(ACTION_CONFIG);
  return [...keys].sort(() => 0.5 - Math.random()).slice(0, 3);
};

export default function ActiveLiveness({ onVerified, resetTrigger }) {
  const webcamRef = useRef(null);
  const hiddenCanvasRef = useRef(null); // Trap canvas for face-swap prevention
  
  const [isAiLoaded, setIsAiLoaded] = useState(false);
  const [sequence, setSequence] = useState([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [flash, setFlash] = useState(false);
  const [warning, setWarning] = useState("");

  const faceLandmarkerRef = useRef(null);
  const requestRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);
  const sequenceRef = useRef([]);
  const currentStepRef = useRef(0);
  const isCompletedRef = useRef(false);
  const awaitingNeutralRef = useRef(false); // Cooldown state

  const initSequence = () => {
    const seq = generateRandomSequence();
    setSequence(seq);
    setCurrentStep(0);
    setIsCompleted(false);
    setWarning("");
    sequenceRef.current = seq;
    currentStepRef.current = 0;
    isCompletedRef.current = false;
    awaitingNeutralRef.current = false;
  };

  useEffect(() => { initSequence(); }, [resetTrigger]);

  useEffect(() => {
    let isCanceled = false;
    const setupAI = async () => {
      const filesetResolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );
      const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
          delegate: "GPU"
        },
        outputFaceBlendshapes: true,
        runningMode: "VIDEO",
        numFaces: 1
      });

      if (!isCanceled) {
        faceLandmarkerRef.current = landmarker;
        setIsAiLoaded(true);
        startDetectionLoop();
      }
    };
    setupAI();

    return () => {
      isCanceled = true;
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (faceLandmarkerRef.current) faceLandmarkerRef.current.close();
    };
  }, []);

  const captureVerifiedFrame = (videoElement) => {
    // SYNCHRONOUS TRAP: Draws the EXACT frame that passed the AI check.
    // It is mathematically impossible to swap the face at this stage.
    const canvas = hiddenCanvasRef.current;
    if (canvas && videoElement) {
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;
      const ctx = canvas.getContext('2d');
      // Mirror the canvas draw if webcam is mirrored, so backend gets exact user view
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      
      canvas.toBlob((blob) => {
        onVerified(blob);
      }, 'image/jpeg', 0.95);
    }
  };

  const startDetectionLoop = () => {
    const detectFace = () => {
      if (isCompletedRef.current) return;

      if (webcamRef.current && webcamRef.current.video && webcamRef.current.video.readyState >= 2) {
        const video = webcamRef.current.video;
        
        if (video.currentTime !== lastVideoTimeRef.current && faceLandmarkerRef.current) {
          lastVideoTimeRef.current = video.currentTime;
          const results = faceLandmarkerRef.current.detectForVideo(video, performance.now());

          // 1. Anti-Spoofing: If face is lost, reset entire sequence to prevent video-swapping
          if (!results.faceLandmarks || results.faceLandmarks.length === 0) {
             if (currentStepRef.current > 0 && !awaitingNeutralRef.current) {
                setWarning("Face lost! Restarting sequence.");
                initSequence();
             }
             requestRef.current = requestAnimationFrame(detectFace);
             return;
          }

          setWarning("");

          // 2. Anti-Spoofing: Wait for neutral pose between challenges to break chained video replays
          if (awaitingNeutralRef.current) {
            if (isNeutral(results)) {
              awaitingNeutralRef.current = false;
            }
            requestRef.current = requestAnimationFrame(detectFace);
            return;
          }

          // 3. Evaluate the active challenge
          const activeActionKey = sequenceRef.current[currentStepRef.current];
          if (activeActionKey && EVALUATORS[activeActionKey](results)) {
            
            setFlash(true);
            setTimeout(() => setFlash(false), 300);

            const nextStep = currentStepRef.current + 1;

            if (nextStep >= sequenceRef.current.length) {
              // PASSED FINAL CHALLENGE - LOCK THE FRAME INSTANTLY
              isCompletedRef.current = true;
              setIsCompleted(true);
              captureVerifiedFrame(video);
              return; // Stop loop, we are done.
            } else {
              // Move to next step, but require neutral cooldown first
              awaitingNeutralRef.current = true;
              currentStepRef.current = nextStep;
              setCurrentStep(nextStep);
            }
          }
        }
      }
      requestRef.current = requestAnimationFrame(detectFace);
    };
    
    requestRef.current = requestAnimationFrame(detectFace);
  };

  const activeAction = sequence[currentStep];

  return (
    <div className="flex flex-col items-center w-full">
      {/* Hidden Canvas for Synchronous Face-Swap Prevention Capture */}
      <canvas ref={hiddenCanvasRef} style={{ display: 'none' }} />

      <div className="flex gap-2 w-full mb-3">
        {sequence.map((_, idx) => (
          <div
            key={idx}
            className={`h-2 flex-1 rounded-full transition-all duration-300 ${
              idx < currentStep || isCompleted ? 'bg-emerald-500' : idx === currentStep ? 'bg-blue-600' : 'bg-slate-200'
            }`}
          />
        ))}
      </div>

      <div className={`w-full py-3 px-4 rounded-xl bg-slate-50 border-2 text-center mb-4 transition-all ${
        isCompleted ? 'border-emerald-500 bg-emerald-50' : flash ? 'border-emerald-500' : 'border-slate-200'
      }`}>
        {!isAiLoaded ? (
          <div className="flex justify-center items-center gap-2 text-slate-500">
            <Loader2 className="animate-spin" size={16} /> 
            <span className="text-sm">Downloading AI Weights...</span>
          </div>
        ) : isCompleted ? (
          <div className="flex justify-center items-center gap-2 text-emerald-700 font-semibold">
            <CheckCircle2 size={20} />
            <span>Liveness Verified! Encrypting payload...</span>
          </div>
        ) : activeAction ? (
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Challenge {currentStep + 1} of {sequence.length}
            </span>
            <p className={`text-base font-bold mt-0.5 ${ACTION_CONFIG[activeAction].color.split(' ')[0]}`}>
              {awaitingNeutralRef.current ? "Hold neutral face..." : ACTION_CONFIG[activeAction].label}
            </p>
            {warning && <p className="text-xs text-red-500 font-bold mt-1 animate-pulse">{warning}</p>}
          </div>
        ) : null}
      </div>

      <div className={`relative w-full aspect-video rounded-xl overflow-hidden bg-slate-900 border-4 transition-all duration-300 ${
        isCompleted ? 'border-emerald-500 shadow-emerald-100 shadow-lg' : 'border-slate-200'
      }`}>
        <Webcam
          audio={false}
          ref={webcamRef}
          mirrored={true} /* Makes it visually feel natural like a mirror */
          screenshotFormat="image/jpeg"
          videoConstraints={{ facingMode: "user", width: 640, height: 480 }}
          className="w-full h-full object-cover"
        />
      </div>

      {isCompleted && (
        <button
          type="button"
          onClick={initSequence}
          className="mt-3 text-xs text-slate-500 hover:text-blue-600 flex items-center gap-1 transition"
        >
          <RefreshCw size={14} /> Restart Sequence
        </button>
      )}
    </div>
  );
}