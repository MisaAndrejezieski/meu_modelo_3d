import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { loadImageBitmap, readTextFile } from './utils.js';

const DEFAULT_BASE_THICKNESS = 2;
const MIN_PLATE_MARGIN = 12;

export async function buildRasterPreview(file, widthMm, maxHeightMm, resolution) {
  const image = await loadImageBitmap(file);
  const aspectRatio = image.height / image.width;
  const heightMm = widthMm * aspectRatio;
  const stepsX = resolution;
  const stepsY = Math.max(8, Math.round(resolution * aspectRatio));

  const canvas = document.createElement('canvas');
  canvas.width = stepsX;
  canvas.height = stepsY;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, stepsX, stepsY);
  const imageData = ctx.getImageData(0, 0, stepsX, stepsY).data;

  const geometry = new THREE.PlaneGeometry(widthMm, heightMm, stepsX - 1, stepsY - 1);
  const positions = geometry.attributes.position;

  for (let index = 0; index < positions.count; index += 1) {
    const r = imageData[index * 4];
    const g = imageData[index * 4 + 1];
    const b = imageData[index * 4 + 2];
    const brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    positions.setZ(index, (1 - brightness) * maxHeightMm + 0.8);
  }

  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.45,
    metalness: 0.05,
    side: THREE.DoubleSide
  });

  const surface = new THREE.Mesh(geometry, material);
  const group = new THREE.Group();
  group.add(surface);

  const plate = createBasePlate(widthMm + MIN_PLATE_MARGIN, heightMm + MIN_PLATE_MARGIN, DEFAULT_BASE_THICKNESS);
  plate.position.set(0, 0, -DEFAULT_BASE_THICKNESS / 2);
  group.add(plate);

  centerGroup(group);

  return {
    group,
    metadata: {
      widthMm,
      heightMm,
      maxHeightMm,
      rows: stepsY,
      cols: stepsX,
      imageData,
      aspectRatio
    }
  };
}

export async function buildSVGPreview(file, widthMm, depthMm) {
  const svgText = await readTextFile(file);
  const svgLoader = new SVGLoader();
  const svgData = svgLoader.parse(svgText);

  const pathGroup = new THREE.Group();

  svgData.paths.forEach((path) => {
    const shapes = SVGLoader.createShapes(path);

    shapes.forEach((shape) => {
      const extrudeSettings = {
        depth: depthMm,
        bevelEnabled: false,
        steps: 1
      };
      const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      const material = new THREE.MeshStandardMaterial({
        color: 0x60a5fa,
        roughness: 0.32,
        metalness: 0.05,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      pathGroup.add(mesh);
    });
  });

  const size = fitGroupToWidth(pathGroup, widthMm);

  const plate = createBasePlate(size.width + MIN_PLATE_MARGIN, size.height + MIN_PLATE_MARGIN, DEFAULT_BASE_THICKNESS);
  plate.position.set(0, 0, -DEFAULT_BASE_THICKNESS / 2);

  const group = new THREE.Group();
  group.add(plate);
  group.add(pathGroup);
  centerGroup(group);

  return {
    group,
    metadata: {
      widthMm: size.width,
      heightMm: size.height,
      depthMm
    }
  };
}

function createBasePlate(width, height, thickness) {
  const geometry = new THREE.BoxGeometry(width, height, thickness);
  const material = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.52,
    metalness: 0.1
  });
  return new THREE.Mesh(geometry, material);
}

function centerGroup(group) {
  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());
  group.position.x -= center.x;
  group.position.y -= center.y;
}

function fitGroupToWidth(group, targetWidth) {
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const scale = targetWidth / Math.max(size.x, size.y, targetWidth);
  group.scale.setScalar(scale);
  group.updateMatrixWorld(true);

  const fittedBox = new THREE.Box3().setFromObject(group);
  const fittedSize = fittedBox.getSize(new THREE.Vector3());
  return {
    width: fittedSize.x,
    height: fittedSize.y
  };
}
