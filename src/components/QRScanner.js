'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export default function QRScanner({
  onScan,
  onError,
  isActive = true,
  defaultCooldown = 1.5,
  suppressAudio = false,
}) {
  const containerIdRef = useRef(`qr-reader-container-${Math.random().toString(36).substring(2, 9)}`);
  const scannerRef = useRef(null);
  const isRunningRef = useRef(false);
  const lastScannedRef = useRef({ code: '', time: 0 });
  const cooldownTimerRef = useRef(null);
  const onScanRef = useRef(onScan);
  const activeInViewCodeRef = useRef(null);
  const lastDetectionTimeRef = useRef(0);
  const handleDecodedTextRef = useRef(null);

  // Keep onScanRef always current to eliminate stale closure bugs
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const [scannerStatus, setScannerStatus] = useState('initializing'); // 'initializing' | 'scanning' | 'paused' | 'error' | 'permission_denied'
  const [errorMessage, setErrorMessage] = useState('');
  const [lastScannedItem, setLastScannedItem] = useState(null);
  const [flashActive, setFlashActive] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [cooldownDuration, setCooldownDuration] = useState(defaultCooldown); // seconds
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [duplicateBlocked, setDuplicateBlocked] = useState(false);

  // Audio feedback for successful scan
  const triggerAudioFeedback = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.1);

      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.12);
    } catch (e) {
      // AudioContext might require user interaction first
    }
  }, []);

  // Audio & haptic feedback for rejected duplicate scan (cooldown active)
  const triggerRejectFeedback = useCallback(() => {
    try {
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([150, 50, 150]);
      }
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(260, ctx.currentTime); // Low warning buzz
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {}
  }, []);

  // Haptic feedback
  const triggerHapticFeedback = useCallback(() => {
    try {
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([80, 40, 80]);
      }
    } catch (e) {
      // Ignore vibration errors
    }
  }, []);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    };
  }, []);

  // Handle successful scan from Html5Qrcode
  const handleDecodedText = useCallback((decodedText) => {
    const cleanText = (decodedText || '').trim();
    if (!cleanText) return;

    const now = Date.now();

    // 1. HARD CAMERA LOCK: If the camera is still pointing at the exact same QR code, DO NOT re-trigger!
    // As long as the physical box stays in the viewfinder, it will NEVER scan again.
    if (activeInViewCodeRef.current === cleanText) {
      lastDetectionTimeRef.current = now;
      return;
    }

    // 2. A new box has entered the camera view!
    activeInViewCodeRef.current = cleanText;
    lastDetectionTimeRef.current = now;

    lastScannedRef.current = { code: cleanText, time: now };
    setLastScannedItem({
      code: cleanText,
      timestamp: new Date().toLocaleTimeString(),
    });

    // Start visual cooldown countdown
    setCooldownRemaining(cooldownDuration);
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);

    cooldownTimerRef.current = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Visual flash
    setFlashActive(true);
    setTimeout(() => setFlashActive(false), 350);

    // Audio & vibration (if parent doesn't manage its own custom chimes)
    if (!suppressAudio) {
      triggerAudioFeedback();
      triggerHapticFeedback();
    }

    // Always trigger through onScanRef to ensure freshest handler
    if (onScanRef.current) {
      onScanRef.current(cleanText);
    }
  }, [cooldownDuration, suppressAudio, triggerAudioFeedback, triggerHapticFeedback]);

  // Keep handleDecodedTextRef synced
  useEffect(() => {
    handleDecodedTextRef.current = handleDecodedText;
  }, [handleDecodedText]);

  // Start the scanner
  const startScanning = useCallback(async (cameraIdToUse) => {
    if (!isActive) return;

    try {
      setScannerStatus('initializing');
      setErrorMessage('');

      const { Html5Qrcode } = await import('html5-qrcode');

      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode(containerIdRef.current, /* verbose */ false);
      }

      const scanner = scannerRef.current;

      // If already running, stop first
      if (isRunningRef.current) {
        try {
          await scanner.stop();
          isRunningRef.current = false;
        } catch (e) {
          // ignore
        }
      }

      // Discover cameras if not yet listed
      try {
        const devices = await Html5Qrcode.getCameras();
        if (devices && devices.length > 0) {
          setCameras(devices);
          if (!cameraIdToUse && !selectedCameraId) {
            // Prefer back camera if found
            const backCam = devices.find((d) =>
              /back|rear|environment|wide/i.test(d.label)
            );
            cameraIdToUse = backCam ? backCam.id : devices[0].id;
            setSelectedCameraId(cameraIdToUse);
          }
        }
      } catch (camErr) {
        console.warn('Could not list cameras:', camErr);
      }

      const cameraConfig = cameraIdToUse
        ? { deviceId: { exact: cameraIdToUse } }
        : { facingMode: 'environment' };

      const scanConfig = {
        fps: 10,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          const edge = Math.min(viewfinderWidth, viewfinderHeight);
          const size = Math.max(180, Math.floor(edge * 0.72));
          return { width: size, height: size };
        },
        aspectRatio: 1.0,
      };

      await scanner.start(
        cameraConfig,
        scanConfig,
        (decodedText) => {
          handleDecodedTextRef.current?.(decodedText);
        },
        (scanError) => {
          // If no QR code has been in view for > 1200ms, unlock activeInViewCodeRef
          // so another box (or this box after moving away) can scan cleanly
          if (activeInViewCodeRef.current && Date.now() - lastDetectionTimeRef.current > 1200) {
            activeInViewCodeRef.current = null;
          }
        }
      );

      isRunningRef.current = true;
      setScannerStatus('scanning');
    } catch (err) {
      console.error('Html5Qrcode start error:', err);
      const errStr = (err?.message || err?.toString() || '').toLowerCase();
      if (
        errStr.includes('permission') ||
        errStr.includes('denied') ||
        errStr.includes('notallowed')
      ) {
        setScannerStatus('permission_denied');
        setErrorMessage('Camera access was denied. Please allow camera permissions in your browser settings.');
      } else {
        setScannerStatus('error');
        setErrorMessage(
          err?.message || 'Could not start camera. Make sure no other app is using it.'
        );
      }
      if (onError) onError(err);
    }
  }, [isActive, selectedCameraId, handleDecodedText, onError]);

  // Stop scanning
  const stopScanning = useCallback(async () => {
    if (scannerRef.current && isRunningRef.current) {
      try {
        await scannerRef.current.stop();
        isRunningRef.current = false;
        setScannerStatus('paused');
      } catch (err) {
        console.warn('Error stopping scanner:', err);
      }
    }
  }, []);

  // Switch camera
  const handleCameraChange = async (e) => {
    const newId = e.target.value;
    setSelectedCameraId(newId);
    if (isRunningRef.current) {
      await stopScanning();
      await startScanning(newId);
    }
  };

  // Effect to manage scanner lifecycle
  useEffect(() => {
    let mounted = true;

    if (isActive) {
      startScanning(selectedCameraId);
    } else {
      stopScanning();
    }

    return () => {
      mounted = false;
      if (scannerRef.current && isRunningRef.current) {
        scannerRef.current
          .stop()
          .then(() => {
            try {
              scannerRef.current?.clear();
            } catch (e) {
              // ignore
            }
            isRunningRef.current = false;
          })
          .catch((e) => {
            console.warn('Cleanup error on unmount:', e);
          });
      }
    };
  }, [isActive]);

  return (
    <div className="w-full bg-gray-900 rounded-2xl overflow-hidden shadow-lg border border-gray-800 text-white">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-800/80 border-b border-gray-700/60">
        <div className="flex items-center space-x-2">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              scannerStatus === 'scanning'
                ? 'bg-emerald-500 animate-pulse'
                : scannerStatus === 'initializing'
                ? 'bg-amber-400 animate-ping'
                : 'bg-rose-500'
            }`}
          />
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-300">
            {scannerStatus === 'scanning'
              ? 'Continuous QR Scanner'
              : scannerStatus === 'initializing'
              ? 'Starting Camera...'
              : scannerStatus === 'paused'
              ? 'Camera Paused'
              : 'Camera Offline'}
          </span>
        </div>

        {/* Camera Selector (if multiple) */}
        {cameras.length > 1 && (
          <select
            value={selectedCameraId}
            onChange={handleCameraChange}
            className="text-xs bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-gray-200 focus:outline-none focus:ring-1 focus:ring-primary-500 max-w-[140px] truncate"
          >
            {cameras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label || `Camera ${c.id.substring(0, 5)}`}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Camera Viewport Container */}
      <div className="relative bg-black min-h-[260px] sm:min-h-[300px] flex items-center justify-center overflow-hidden">
        {/* Flash Indicator on Scan */}
        <div
          className={`absolute inset-0 pointer-events-none z-30 transition-opacity duration-300 ${
            flashActive
              ? 'opacity-100 bg-emerald-500/25 ring-4 ring-inset ring-emerald-400'
              : 'opacity-0'
          }`}
        />

        {/* QR Scanner Target Container (Html5Qrcode attaches here) */}
        <div
          id={containerIdRef.current}
          className="w-full h-full max-w-md mx-auto aspect-square overflow-hidden"
        />

        {/* Scanning Line & Reticle Overlay (Only when actively scanning) */}
        {scannerStatus === 'scanning' && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
            {/* Reticle Target Frame */}
            <div className="relative w-56 h-56 sm:w-64 sm:h-64 rounded-2xl border-2 border-primary-400/60 shadow-[0_0_20px_rgba(99,102,241,0.25)]">
              {/* Corner brackets */}
              <div className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-primary-400 rounded-tl-lg" />
              <div className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-primary-400 rounded-tr-lg" />
              <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-primary-400 rounded-bl-lg" />
              <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-primary-400 rounded-br-lg" />

              {/* Animated Laser Scanning Line */}
              <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-primary-400 to-transparent shadow-[0_0_8px_#818cf8] animate-scanLine" />
            </div>

            {/* Duplicate Scan Warning Banner */}
            {duplicateBlocked && (
              <div className="absolute top-4 inset-x-4 pointer-events-auto bg-amber-500 text-gray-950 font-bold text-xs py-2 px-3 rounded-xl shadow-xl flex items-center justify-center space-x-2 animate-bounce border-2 border-amber-300">
                <span className="text-base">⚠️</span>
                <span>Box already counted! Move camera to next box ({cooldownRemaining}s)</span>
              </div>
            )}

            {/* Normal Active Cooldown Countdown Badge */}
            {!duplicateBlocked && cooldownRemaining > 0 && (
              <div className="absolute top-4 inset-x-4 pointer-events-none bg-gray-900/85 backdrop-blur-sm border border-emerald-500/40 text-emerald-300 text-xs py-1.5 px-3 rounded-xl flex items-center justify-between shadow-lg">
                <span className="flex items-center space-x-2 truncate">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span>Counted <strong>{lastScannedItem?.code}</strong> (+1)</span>
                </span>
                <span className="font-mono text-emerald-400 text-[11px] bg-emerald-950/90 px-2 py-0.5 rounded border border-emerald-800 ml-2">
                  Cooldown {cooldownRemaining}s
                </span>
              </div>
            )}
          </div>
        )}

        {/* Initializing State Overlay */}
        {scannerStatus === 'initializing' && (
          <div className="absolute inset-0 bg-gray-900/90 z-20 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm font-medium text-gray-200">Starting video stream...</p>
            <p className="text-xs text-gray-400 mt-1">Please allow camera permissions if prompted</p>
          </div>
        )}

        {/* Permission Denied Overlay */}
        {scannerStatus === 'permission_denied' && (
          <div className="absolute inset-0 bg-gray-900 z-20 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-900/40 border border-rose-700/60 text-rose-400 flex items-center justify-center text-xl mb-3">
              📷
            </div>
            <h4 className="text-sm font-bold text-white mb-1">Camera Permission Blocked</h4>
            <p className="text-xs text-gray-300 max-w-xs mb-4">
              {errorMessage || 'Browser camera permissions are needed to scan cooler model QR codes.'}
            </p>
            <button
              type="button"
              onClick={() => startScanning(selectedCameraId)}
              className="btn-primary text-xs py-2 px-4 shadow"
            >
              Retry Camera Access
            </button>
          </div>
        )}

        {/* General Error Overlay */}
        {scannerStatus === 'error' && (
          <div className="absolute inset-0 bg-gray-900 z-20 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-amber-900/40 border border-amber-700/60 text-amber-400 flex items-center justify-center text-xl mb-3">
              ⚠️
            </div>
            <h4 className="text-sm font-bold text-white mb-1">Camera Unavailable</h4>
            <p className="text-xs text-gray-300 max-w-xs mb-4">{errorMessage}</p>
            <button
              type="button"
              onClick={() => startScanning(selectedCameraId)}
              className="btn-secondary text-xs py-2 px-4 text-gray-900"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Paused State Overlay */}
        {scannerStatus === 'paused' && (
          <div className="absolute inset-0 bg-gray-900/90 z-20 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-800 text-gray-300 flex items-center justify-center text-xl mb-3">
              ⏸️
            </div>
            <p className="text-sm font-semibold text-gray-200 mb-3">Scanner is currently paused</p>
            <button
              type="button"
              onClick={() => startScanning(selectedCameraId)}
              className="btn-primary text-xs py-2 px-4"
            >
              Resume Scanning
            </button>
          </div>
        )}
      </div>

      {/* Scanner Controls & Last Scanned Bar */}
      <div className="p-3 bg-gray-800/90 border-t border-gray-700/60 flex flex-col sm:flex-row items-center justify-between gap-2.5">
        {/* Last Scanned Status Display */}
        <div className="flex items-center space-x-2 text-xs w-full sm:w-auto truncate">
          <span className="text-gray-400 font-medium">Last Scanned:</span>
          {lastScannedItem ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 animate-fadeIn">
              ✓ {lastScannedItem.code}
              <span className="ml-1.5 text-[10px] text-emerald-400 font-normal opacity-80">
                ({lastScannedItem.timestamp})
              </span>
            </span>
          ) : (
            <span className="text-gray-500 italic">Point camera at cooler QR code</span>
          )}
        </div>

        {/* Quick Action Toggle Buttons */}
        <div className="flex flex-wrap items-center space-x-2 w-full sm:w-auto justify-end gap-1.5">
          <div className="flex items-center space-x-1 bg-gray-900/90 border border-gray-700 rounded-lg p-0.5 text-[11px] text-gray-300">
            <span className="px-1 text-gray-400 font-medium">Delay:</span>
            {[2, 3, 5].map((sec) => (
              <button
                key={sec}
                type="button"
                onClick={() => setCooldownDuration(sec)}
                className={`px-1.5 py-0.5 rounded font-mono font-semibold transition-colors ${
                  cooldownDuration === sec
                    ? 'bg-primary-600 text-white shadow-xs'
                    : 'text-gray-400 hover:text-white'
                }`}
                title={`Set ${sec} seconds cooldown on identical box scans`}
              >
                {sec}s
              </button>
            ))}
          </div>

          {scannerStatus === 'scanning' ? (
            <button
              type="button"
              onClick={stopScanning}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold bg-gray-700 hover:bg-gray-600 text-gray-200 border border-gray-600 transition-colors flex items-center space-x-1"
            >
              <span>⏸</span>
              <span>Pause</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => startScanning(selectedCameraId)}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center space-x-1"
            >
              <span>▶</span>
              <span>Start Camera</span>
            </button>
          )}
        </div>
      </div>

      {/* Scanning Laser Animation Styles */}
      <style jsx global>{`
        @keyframes scanLaser {
          0% {
            top: 5%;
            opacity: 0.2;
          }
          50% {
            opacity: 1;
          }
          100% {
            top: 92%;
            opacity: 0.2;
          }
        }
        .animate-scanLine {
          position: absolute;
          animation: scanLaser 2s cubic-bezier(0.4, 0, 0.6, 1) infinite alternate;
        }
        #${containerIdRef.current} video {
          object-fit: cover !important;
          width: 100% !important;
          height: 100% !important;
          border-radius: 0.75rem;
        }
      `}</style>
    </div>
  );
}
