import { caseImageLimit } from '../config/casesMeta.js';

/**
 * Картинка кейса для админки: PNG-файл → data-URL.
 *
 * Сервер хранит картинку целиком в БД (лимит `caseImageMax` в server/casesApi.js)
 * и отдаёт её приложению байтами через `/api/cases/:id/image`, поэтому файл
 * уменьшается до `maxSide` по длинной стороне и ужимается до тех пор, пока
 * data-URL не влезет в лимит. Формат всегда PNG: сервер принимает только его
 * (`caseImagePattern`), зато у кейсов сохраняется прозрачный фон капсулы.
 *
 * Ошибки бросаются ключами словаря (`admin.cases.errors.*`) — вызывающая сторона
 * сама переводит их через `t()`.
 */
export function caseImageFromFile(file, { maxSide = 512, limit = caseImageLimit, steps = [1, 0.75, 0.5] } = {}) {
  return new Promise((resolve, reject) => {
    if (!file || String(file.type || '') !== 'image/png') {
      reject(new Error('admin.cases.errors.imageNotPng'));
      return;
    }

    const reader = new FileReader();

    reader.onerror = () => reject(new Error('admin.cases.errors.imageRead'));

    reader.onload = () => {
      const image = new Image();

      image.onerror = () => reject(new Error('admin.cases.errors.imageDecode'));

      image.onload = () => {
        for (const step of steps) {
          const side = Math.round(maxSide * step);
          const scale = Math.min(1, side / Math.max(image.width, image.height));
          const width = Math.max(1, Math.round(image.width * scale));
          const height = Math.max(1, Math.round(image.height * scale));
          const canvas = document.createElement('canvas');

          canvas.width = width;
          canvas.height = height;
          canvas.getContext('2d').drawImage(image, 0, 0, width, height);

          const dataUrl = canvas.toDataURL('image/png');

          if (dataUrl.length <= limit) {
            resolve(dataUrl);
            return;
          }
        }

        reject(new Error('admin.cases.errors.imageTooBig'));
      };

      image.src = String(reader.result || '');
    };

    reader.readAsDataURL(file);
  });
}

/** Примерный размер картинки в килобайтах — для подписи в редакторе. */
export function caseImageKb(dataUrl) {
  const bytes = Math.round((String(dataUrl || '').length * 3) / 4);

  return Math.max(1, Math.round(bytes / 1024));
}
