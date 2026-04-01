import { useRef, useEffect, useState } from 'react';
import { api } from '../api/client';

export default function StreamPreview({ active }) {
  const videoRef = useRef(null);
  const pcRef = useRef(null);
  const [mode, setMode] = useState(null); // 'webrtc' | 'hls'
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!active) {
      cleanup();
      setError(null);
      return;
    }

    detectMode();
  }, [active]);

  async function detectMode() {
    try {
      const ctx = await api('/network/context');
      const m = ctx.isTailscale ? 'hls' : 'webrtc';
      setMode(m);

      if (m === 'webrtc') {
        startWebRTC();
      } else {
        startHLS();
      }
    } catch {
      setError('Could not detect network context');
    }
  }

  async function startWebRTC() {
    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      pcRef.current = pc;

      pc.ontrack = (event) => {
        if (videoRef.current) {
          videoRef.current.srcObject = event.streams[0];
        }
      };

      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const response = await fetch('/api/preview/webrtc?src=live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: offer.sdp,
      });

      if (!response.ok) throw new Error('WebRTC signaling failed');

      const answerSdp = await response.text();
      await pc.setRemoteDescription(new RTCSessionDescription({
        type: 'answer',
        sdp: answerSdp,
      }));
    } catch (err) {
      setError('WebRTC preview unavailable');
      // Fallback to HLS
      setMode('hls');
      startHLS();
    }
  }

  async function startHLS() {
    if (!videoRef.current) return;

    try {
      const Hls = (await import('hls.js')).default;

      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
        });
        hls.loadSource('/api/preview/hls/live/index.m3u8');
        hls.attachMedia(videoRef.current);
        hls.on(Hls.Events.ERROR, () => {
          setError('HLS stream unavailable');
        });
      } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
        videoRef.current.src = '/api/preview/hls/live/index.m3u8';
      } else {
        setError('HLS not supported in this browser');
      }
    } catch {
      setError('Could not load HLS player');
    }
  }

  function cleanup() {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.src = '';
    }
    setMode(null);
  }

  if (!active) {
    return (
      <div style={{
        background: '#000',
        borderRadius: '8px',
        aspectRatio: '16/9',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#666',
        maxWidth: '640px',
      }}>
        No active stream
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', maxWidth: '640px' }}>
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{
          width: '100%',
          borderRadius: '8px',
          background: '#000',
          aspectRatio: '16/9',
        }}
      />
      {mode && (
        <span style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          background: 'rgba(0,0,0,0.7)',
          color: mode === 'webrtc' ? '#27ae60' : '#f39c12',
          padding: '2px 8px',
          borderRadius: '4px',
          fontSize: '12px',
        }}>
          {mode === 'webrtc' ? 'Live' : '~5s delay'}
        </span>
      )}
      {error && (
        <div style={{
          position: 'absolute',
          bottom: '8px',
          left: '8px',
          background: 'rgba(231,76,60,0.9)',
          color: '#fff',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '12px',
        }}>
          {error}
        </div>
      )}
    </div>
  );
}
