const moduleURL=new URL('./assets/vision/vision_bundle.mjs',self.location.href).href;
self.onmessage=async ({data:{bitmap}})=>{
  let detector;
  try {
    const started=performance.now();
    const {FaceDetector}=await import(moduleURL);
    detector=await FaceDetector.createFromOptions({wasmLoaderPath:new URL('./assets/vision/vision_wasm_nosimd_internal.js',self.location.href).href,wasmBinaryPath:new URL('./assets/vision/vision_wasm_nosimd_internal.wasm',self.location.href).href},{baseOptions:{modelAssetPath:new URL('./assets/vision/face.tflite',self.location.href).href,delegate:'CPU'},runningMode:'IMAGE',minDetectionConfidence:.5});
    const ready=performance.now(), {detections}=detector.detect(bitmap);
    postMessage({faces:detections.map(d=>({box:d.boundingBox,points:d.keypoints})),loadMs:Math.round(ready-started),detectMs:Math.round(performance.now()-ready)});
  } catch { postMessage({error:true}); }
  finally { detector?.close();bitmap.close(); }
};
