import customProperties from '@helpers/dom/customProperties';
import {Middleware} from '@helpers/middleware';
import noop from '@helpers/noop';
import pause from '@helpers/schedulers/pause';
import {MyDocument} from '@appManagers/appDocsManager';
import {applyColorOnContext} from '@lib/lottie/lottiePlayer';
import rootScope from '@lib/rootScope';
import wrapSticker from '@components/wrappers/sticker';

export default async function wrapEmojiPattern({
  docId,
  middleware,
  useHighlightingColor,
  colorAsOut,
  container,
  color,
  positions,
  canvasWidth,
  canvasHeight,
  emojiSize,
  onCacheStatus: onCacheStatus
}: {
  docId: DocId | MyDocument,
  middleware: Middleware,
  useHighlightingColor?: boolean,
  colorAsOut?: boolean,
  container?: HTMLElement,
  color?: string,
  positions: [x: number, y: number, size: number, alpha: number][],
  canvasWidth: number,
  canvasHeight: number,
  emojiSize: number,
  onCacheStatus?: (cached: boolean) => void
}) {
  let doc: MyDocument;
  if(typeof docId  === 'object') {
    doc = docId;
  } else {
    const result = await rootScope.managers.acknowledged.appEmojiManager.getCustomEmojiDocument(docId);
    if(!result.cached) onCacheStatus?.(false);
    doc = await result.result;
  }

  const d = document.createElement('div');
  return wrapSticker({
    doc,
    div: d,
    middleware,
    width: emojiSize,
    height: emojiSize,
    // onlyThumb: true,
    static: false,
    noOffscreen: true,
    withThumb: false,
    exportLoad: 2,
    useCache: false
  }).then(({load, downloaded}) => {
    onCacheStatus?.(downloaded);
    return load();
  }).then((result) => {
    let image: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement;
    let isLottie = false;

    if (result && !Array.isArray(result) && (result as any).canvas) {
      isLottie = true;
      image = (result as any).canvas[0];
    } else {
      image = (result as any)[0];
    }

    if(!image) return Promise.reject('No image returned');

    if (isLottie) {
      return new Promise<HTMLImageElement | HTMLCanvasElement | HTMLVideoElement>((resolve) => {
        (result as any).addEventListener('firstFrame', () => {
          resolve(image);
          setTimeout(() => (result as any).destroy?.(), 10);
        });
      });
    } else if (image instanceof HTMLVideoElement) {
      if(image.readyState >= 2) {
        image.pause();
        return image;
      }
      return new Promise<HTMLImageElement | HTMLCanvasElement | HTMLVideoElement>((resolve) => {
        image.addEventListener('loadeddata', () => {
          image.pause();
          resolve(image);
        });
      });
    } else {
      const img = image as HTMLImageElement;
      if(img.naturalWidth) return img;
      return img.decode().then(() => {
        if(!img.naturalWidth) return Promise.reject('Image broken');
        return img;
      }).catch(() => Promise.reject('Image broken'));
    }
  }).then((image: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement) => {
    const canvas = document.createElement('canvas');
    canvas.classList.add('emoji-pattern-canvas');
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;
    const ctx = canvas.getContext('2d');
    const dpr = canvas.dpr = window.devicePixelRatio;
    canvas.width = canvasWidth * dpr;
    canvas.height = canvasHeight * dpr;
    positions.forEach(([x, y, size, alpha]) => {
      ctx.globalAlpha = alpha;
      ctx.drawImage(image, x * dpr, y * dpr, size * dpr, size * dpr);
    });
    ctx.globalAlpha = 1;

    if(useHighlightingColor) {
      color = '#ffffff';
    } else if(colorAsOut) {
      color = customProperties.getProperty('message-out-primary-color');
    }

    applyColorOnContext(ctx, color, 0, 0, canvas.width, canvas.height);
    if(container) container.prepend(canvas);
    return canvas;
  }).catch(noop) as Promise<HTMLCanvasElement>;
}
