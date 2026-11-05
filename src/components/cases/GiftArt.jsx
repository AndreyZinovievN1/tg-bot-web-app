import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import GiftLottie from './GiftLottie.jsx';
import { giftAnimationKey } from '../../utils/giftCatalog.js';

const motionQuery = '(prefers-reduced-motion: reduce)';
function reducedMotion() { return typeof matchMedia === 'function' && matchMedia(motionQuery).matches; }
function subscribeMotion(listener) {
  if (typeof matchMedia !== 'function') return () => {};
  const query = matchMedia(motionQuery);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

/** Shared gift art. Only case-content previews opt into interaction-only playback. */
function GiftArt({ animated = false, interactive = false, label = '', className = 'gift-art', gift = null, giftId = '', icon = '🎁', lazy = false }) {
  const id = String(giftId || '').trim() || giftAnimationKey(gift);
  if (interactive) {
    return <GiftPreview key={`${id}:${gift?.image || ''}`} animated={animated} className={className}
      gift={gift} id={id} icon={icon} label={label} />;
  }
  // Keep the existing catalog, reveal and admin behavior outside case-content cards.
  const placeholder = gift?.image
    ? <img alt="" className="gift-art__img" decoding="async" loading="lazy" src={gift.image} />
    : <span aria-hidden="true" className="gift-art__icon">{icon}</span>;
  return <span className={className}>{animated && id
    ? <GiftLottie fallback={placeholder} giftId={id} keepFallback={lazy} lazy={lazy} />
    : placeholder}</span>;
}

function GiftPreview({ animated, className, gift, id, icon, label }) {
  const reduce = useSyncExternalStore(subscribeMotion, reducedMotion, () => true);
  const [playing, setPlaying] = useState(false);
  const anchor = useRef(null);
  const stop = useCallback(() => setPlaying(false), []);
  const start = () => { if (!reduce) setPlaying(true); };
  useEffect(() => {
    const hide = () => { if (document.hidden) stop(); };
    const motion = matchMedia(motionQuery);
    const motionChanged = () => { if (motion.matches) stop(); };
    motion.addEventListener('change', motionChanged);
    document.addEventListener('visibilitychange', hide);
    const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) stop();
    }) : null;
    if (anchor.current) observer?.observe(anchor.current);
    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', hide);
      motion.removeEventListener('change', motionChanged);
    };
  }, [stop]);
  const fallback = gift?.image
    ? <GiftMediaPreview src={gift.image} playing={playing && !reduce} onComplete={stop} icon={icon} />
    : <span aria-hidden="true" className="gift-art__icon">{icon}</span>;
  return (
    <button className={`${className} gift-art--preview`} type="button" ref={anchor} aria-label={label || gift?.title || icon}
      onPointerEnter={event => {
        if (event.pointerType === 'mouse' && matchMedia('(hover: hover)').matches) start();
      }}
      onPointerLeave={event => { if (event.pointerType === 'mouse') stop(); }}
      onPointerDown={event => { if (event.pointerType !== 'mouse') start(); }}
      onPointerCancel={stop} onBlur={stop}
      onClick={event => { if (event.detail === 0) start(); }}>
      {animated && id
        ? <GiftLottie giftId={id} fallback={fallback} keepFallback playing={playing && !reduce} loop={false} onComplete={stop} />
        : fallback}
    </button>
  );
}

/** Video uses its media API; it is never paused by merely hiding a CSS animation. */
function GiftMediaPreview({ src, playing, onComplete, icon }) {
  const video = /(?:\.(?:mp4|webm|ogv|mov)(?:[?#]|$)|^data:video\/)/i.test(src);
  return video ? <GiftVideoPreview src={src} playing={playing} onComplete={onComplete} />
    : <GiftImagePreview src={src} playing={playing} onComplete={onComplete} icon={icon} />;
}

function GiftVideoPreview({ src, playing, onComplete }) {
  const ref = useRef(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (playing) {
      video.currentTime = 0;
      video.play().catch(onComplete);
    } else {
      video.pause();
      video.currentTime = 0;
    }
    return () => video.pause();
  }, [playing, src, onComplete]);
  return <video className="gift-art__img" ref={ref} src={src} muted playsInline preload="auto"
    onEnded={onComplete} onError={onComplete} aria-hidden="true" />;
}

/**
 * Raster previews keep a decoded first frame on canvas, not a hidden looping GIF.
 * During interaction a fresh blob URL starts the original GIF/APNG/WebP at frame 0.
 * Its encoded frame delays determine one cycle; the animated element is unloaded
 * afterwards. No assets are rewritten. Cross-origin images without CORS still
 * display via img/canvas, but their unobservable duration uses a bounded 5s preview.
 */
function GiftImagePreview({ src, playing, onComplete, icon }) {
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const [asset, setAsset] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    let url = '';
    let image;
    const draw = bitmap => {
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      const width = bitmap.naturalWidth || bitmap.width;
      const height = bitmap.naturalHeight || bitmap.height;
      const scale = Math.min(1, 512 / Math.max(width, height));
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    };
    const fromImage = source => new Promise((resolve, reject) => {
      image = new Image();
      image.onload = () => { draw(image); image.src = ''; resolve(); };
      image.onerror = reject;
      image.src = source;
    });
    (async () => {
      let blob;
      let duration = 5000;
      try {
        const response = await fetch(src, { signal: controller.signal });
        if (!response.ok) throw new Error('Image unavailable');
        blob = await response.blob();
        duration = imageCycleDuration(new Uint8Array(await blob.arrayBuffer()));
        try {
          const bitmap = await createImageBitmap(blob);
          draw(bitmap);
          bitmap.close();
        } catch {
          url = URL.createObjectURL(blob);
          await fromImage(url);
        }
      } catch (error) {
        if (cancelled || error?.name === 'AbortError') return;
        await fromImage(src);
      }
      if (!cancelled) setAsset({ blob, duration });
    })().catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      controller.abort();
      if (image) { image.onload = null; image.onerror = null; image.src = ''; }
      if (url) URL.revokeObjectURL(url);
    };
  }, [src]);

  useEffect(() => {
    const image = imageRef.current;
    const canvas = canvasRef.current;
    if (!image || !canvas || !asset || !playing || asset.duration === 0) return;
    const url = asset.blob ? URL.createObjectURL(asset.blob) : src;
    let timer;
    const reset = () => { image.hidden = true; canvas.hidden = false; image.removeAttribute('src'); };
    image.onload = () => {
      image.hidden = false;
      canvas.hidden = true;
      timer = window.setTimeout(() => { reset(); onComplete(); }, asset.duration);
    };
    image.onerror = () => { reset(); onComplete(); };
    image.src = url;
    return () => {
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      reset();
      if (asset.blob) URL.revokeObjectURL(url);
    };
  }, [asset, playing, src, onComplete]);

  return <span className="gift-art__raster">
    <canvas className="gift-art__img" ref={canvasRef} hidden={failed} aria-hidden="true" />
    <img className="gift-art__img" ref={imageRef} alt="" hidden />
    {failed ? <span className="gift-art__icon" aria-hidden="true">{icon}</span> : null}
  </span>;
}

/** One encoded cycle in ms. Unknown animated formats are bounded, never left looping. */
function imageCycleDuration(bytes) {
  const text = (offset, length) => String.fromCharCode(...bytes.subarray(offset, offset + length));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (text(0, 3) === 'GIF' && bytes.length >= 13) {
    let offset = 13 + (bytes[10] & 128 ? 3 * (2 ** ((bytes[10] & 7) + 1)) : 0);
    let delay = 100, total = 0, frames = 0;
    const skip = () => { while (offset < bytes.length) { const size = bytes[offset++]; if (!size) break; offset += size; } };
    while (offset < bytes.length) {
      const kind = bytes[offset++];
      if (kind === 0x3b) break;
      if (kind === 0x21) {
        const label = bytes[offset++];
        if (label === 0xf9 && offset + 5 < bytes.length) {
          const encoded = bytes[offset + 2] | (bytes[offset + 3] << 8);
          delay = encoded < 2 ? 100 : encoded * 10;
        }
        skip();
      } else if (kind === 0x2c && offset + 9 <= bytes.length) {
        const packed = bytes[offset + 8];
        offset += 9 + (packed & 128 ? 3 * (2 ** ((packed & 7) + 1)) : 0);
        offset += 1;
        skip();
        total += delay; frames += 1; delay = 100;
      } else break;
    }
    return frames > 1 ? total : 0;
  }
  if (text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP') {
    let total = 0;
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const size = view.getUint32(offset + 4, true);
      if (size > bytes.length - offset - 8) break;
      if (text(offset, 4) === 'ANMF' && size >= 16) {
        const delay = bytes[offset + 20] | (bytes[offset + 21] << 8) | (bytes[offset + 22] << 16);
        total += delay < 11 ? 100 : delay;
      }
      offset += 8 + size + (size % 2);
    }
    return total;
  }
  if (bytes[0] === 137 && text(1, 3) === 'PNG') {
    let total = 0;
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const size = view.getUint32(offset);
      if (size > bytes.length - offset - 12) break;
      if (text(offset + 4, 4) === 'fcTL' && size >= 26) {
        const delay = view.getUint16(offset + 28) * 1000 / (view.getUint16(offset + 30) || 100);
        total += delay < 11 ? 100 : delay;
      }
      offset += 12 + size;
    }
    return total;
  }
  // JPEG/BMP are static; SVG/unknown image formats may contain animation.
  return (bytes[0] === 255 && bytes[1] === 216) || text(0, 2) === 'BM' ? 0 : 5000;
}

export default GiftArt;
