import { useCallback } from 'react';

export const useWebcamCapture = (webcamRef) => {

  // Highly optimized binary conversion algorithm
  const base64ToBlob = useCallback((base64, mimeType = 'image/jpeg') => {
    const byteString = atob(base64.split(',')[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mimeType });
  }, []);

  const captureSingleFrame = useCallback(() => {
    if (!webcamRef.current) return null;
    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) return null;
    return base64ToBlob(imageSrc);
  }, [webcamRef, base64ToBlob]);

  const captureMultipleFrames = useCallback(async (frameCount = 5, intervalMs = 500) => {
    const frames = [];
    for (let i = 0; i < frameCount; i++) {
      const blob = captureSingleFrame();
      if (blob) frames.push(blob);
      // Non-blocking sleep
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    return frames;
  }, [captureSingleFrame]);

  return { captureSingleFrame, captureMultipleFrames };
};