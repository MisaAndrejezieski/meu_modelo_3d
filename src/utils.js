export function formatValue(value, decimals = 2) {
  return Number(value).toFixed(decimals);
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function isSVGFile(file) {
  return file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
}

export function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export function loadImageBitmap(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = (error) => {
      URL.revokeObjectURL(url);
      reject(error);
    };
    image.src = url;
  });
}
