import React, { useRef, useState, useEffect } from 'react';
import Webcam from 'react-webcam';
import { CheckCircle2, RefreshCw, Loader2 } from 'lucide-react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

// --- MODERN BLENDSHAPE EVALUATORS ---
// Google Tasks Vision natively scores facial expressions from 0.0 (none) to 1.0 (maximum)
const getBlendshape = (categories, name) => {
  const shape = categories.find(c => c.categoryName === name);
  return shape ? shape.score : 0;
};

const EVALUATORS = {
  BLINK: (results) => {
    if (!results.faceBlendshapes || results.faceBlendshapes.length === 0) return false;
    const shapes = results.faceBlendshapes[0].categories;
    const leftBlink = getBlendshape(shapes, 'eyeBlinkLeft');
    const rightBlink = getBlendshape(shapes, 'eyeBlinkRight');
    return leftBlink > 0.4 && rightBlink > 0.4;
  },
  SMILE: (results) => {
    if (!results.faceBlendshapes || results.faceBlendshapes.length === 0) return false;
    const shapes = results.faceBlendshapes[0].categories;
    const leftSmile = getBlendshape(shapes, 'mouthSmileLeft');
    const rightSmile = getBlendshape(shapes, 'mouthSmileRight');
    return leftSmile > 0.5 && rightSmile > 0.5;
  },
  LOOK_LEFT: (results) => {
    if (!results.faceLandmarks || results.faceLandmarks.length === 0) return false;
    const landmarks = results.faceLandmarks[0];
    const nose = landmarks[1];
    const leftCheek = landmarks[234];
    const rightCheek = landmarks[454];
    const distToLeft = Math.abs(nose.x - leftCheek.x);
    const distToRight = Math.abs(rightCheek.x - nose.x);
    return (distToLeft / distToRight) < 0.45;
  },
  LOOK_RIGHT: (results) => {
    if (!results.faceLandmarks || results.faceLandmarks.length === 0) return false;
    const landmarks = results.faceLandmarks[0];
    const nose = landmarks[1];
    const leftCheek = landmarks[234];
    const rightCheek = landmarks[454];
    const distToLeft = Math.abs(nose.x - leftCheek.x);
    const distToRight = Math.abs(rightCheek.x - nose.x);
    return (distToLeft / distToRight) > 2.20;
  }
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
  
  // UI States
  const [isAiLoaded, setIsAiLoaded] = useState(false);
  const [sequence, setSequence] = useState([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [flash, setFlash] = useState(false);

  // Mutable Engine Refs (avoid React state delays in 60fps video loops)
  const faceLandmarkerRef = useRef(null);
  const requestRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);
  const sequenceRef = useRef([]);
  const currentStepRef = useRef(0);
  const isCompletedRef = useRef(false);
  const cooldownRef = useRef(false);

  // 1. Initialize Sequence
  const initSequence = () => {
    const seq = generateRandomSequence();
    setSequence(seq);
    setCurrentStep(0);
    setIsCompleted(false);
    sequenceRef.current = seq;
    currentStepRef.current = 0;
    isCompletedRef.current = false;
    cooldownRef.current = false;
  };

  useEffect(() => { initSequence(); }, [resetTrigger]);

  // 2. Boot up Google Tasks Vision AI
  useEffect(() => {
    let isCanceled = false;

    const setupAI = async () => {
      const filesetResolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );
      
      const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
          delegate: "GPU" // Hardware acceleration
        },
        outputFaceBlendshapes: true, // Unlocks smile/blink scores!
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

  // 3. The 60 FPS Video Processing Loop
  const startDetectionLoop = () => {
    const detectFace = () => {
      if (isCompletedRef.current || cooldownRef.current) {
        requestRef.current = requestAnimationFrame(detectFace);
        return;
      }

      if (webcamRef.current && webcamRef.current.video && webcamRef.current.video.readyState >= 2) {
        const video = webcamRef.current.video;
        
        // Only run AI if the video frame has actually advanced
        if (video.currentTime !== lastVideoTimeRef.current && faceLandmarkerRef.current) {
          lastVideoTimeRef.current = video.currentTime;
          
          const results = faceLandmarkerRef.current.detectForVideo(video, performance.now());

          if (results.faceLandmarks && results.faceLandmarks.length > 0) {
            const activeActionKey = sequenceRef.current[currentStepRef.current];

            if (activeActionKey && EVALUATORS[activeActionKey](results)) {
              // Action successfully passed
              cooldownRef.current = true;
              setFlash(true);
              setTimeout(() => setFlash(false), 300);

              const nextStep = currentStepRef.current + 1;

              if (nextStep >= sequenceRef.current.length) {
                // SEQUENCE COMPLETE
                isCompletedRef.current = true;
                setIsCompleted(true);
                
                if (webcamRef.current) {
                  const imageSrc = webcamRef.current.getScreenshot();
                  fetch(imageSrc)
                    .then(res => res.blob())
                    .then(blob => onVerified(blob));
                }
              } else {
                // MOVE TO NEXT STEP
                currentStepRef.current = nextStep;
                setCurrentStep(nextStep);
                setTimeout(() => { cooldownRef.current = false; }, 800);
              }
            }
          }
        }
      }
      // Loop endlessly
      requestRef.current = requestAnimationFrame(detectFace);
    };
    
    // Kickstart the loop
    requestRef.current = requestAnimationFrame(detectFace);
  };

  const activeAction = sequence[currentStep];

  return (
    <div className="flex flex-col items-center w-full">
      {/* Progress Bars */}
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

      {/* Instruction UI */}
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
            <span>Liveness Verified! Capturing...</span>
          </div>
        ) : activeAction ? (
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Challenge {currentStep + 1} of {sequence.length}
            </span>
            <p className={`text-base font-bold mt-0.5 ${ACTION_CONFIG[activeAction].color.split(' ')[0]}`}>
              {ACTION_CONFIG[activeAction].label}
            </p>
          </div>
        ) : null}
      </div>

      {/* Camera Feed */}
      <div className={`relative w-full aspect-video rounded-xl overflow-hidden bg-slate-900 border-4 transition-all duration-300 ${
        isCompleted ? 'border-emerald-500 shadow-emerald-100 shadow-lg' : 'border-slate-200'
      }`}>
        <Webcam
          audio={false}
          ref={webcamRef}
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