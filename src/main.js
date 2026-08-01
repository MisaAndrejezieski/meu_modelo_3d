import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';

// --- CENA THREE.JS ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1e1e24);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, -80, 80);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// --- ILUMINAÇÃO (Para destacar o relevo) ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
dirLight.position.set(50, 50, 100);
dirLight.castShadow = true;
scene.add(dirLight);

const dirLight2 = new THREE.DirectionalLight(0x4facfe, 1.0);
dirLight2.position.set(-50, -50, 50);
scene.add(dirLight2);

// Grid de suporte (estilo mesa de impressão)
const gridHelper = new THREE.GridHelper(150, 30, 0x4facfe, 0x444444);
gridHelper.rotation.x = Math.PI / 2;
scene.add(gridHelper);

// --- ESTADO GLOBAL ---
let currentMesh = null;
let imageCanvas = document.createElement('canvas');
let ctx = imageCanvas.getContext('2d');
let loadedImage = null;

// Controls UI
const heightSlider = document.getElementById('height-slider');
const baseSlider = document.getElementById('base-slider');
const heightVal = document.getElementById('height-val');
const baseVal = document.getElementById('base-val');

// --- GERADOR DE GEOMETRIA PARA IMPRESSÃO ---
function generate3DMesh() {
  if (!loadedImage) return;

  if (currentMesh) scene.remove(currentMesh);

  const width = 100; // Largura fixa de 100mm (10cm) para impressão
  const height = (loadedImage.height / loadedImage.width) * width;
  
  const widthSegments = 150;
  const heightSegments = Math.round((loadedImage.height / loadedImage.width) * 150);

  const geometry = new THREE.PlaneGeometry(width, height, widthSegments, heightSegments);
  const posAttribute = geometry.attributes.position;

  // Ajustar tamanho do canvas interno para ler os pixels
  imageCanvas.width = widthSegments + 1;
  imageCanvas.height = heightSegments + 1;
  ctx.drawImage(loadedImage, 0, 0, imageCanvas.width, imageCanvas.height);
  const imgData = ctx.getImageData(0, 0, imageCanvas.width, imageCanvas.height).data;

  const maxRelief = parseFloat(heightSlider.value);
  const baseThickness = parseFloat(baseSlider.value);

  // Modificar os vértices com base no brilho (Luminância)
  for (let i = 0; i < posAttribute.count; i++) {
    const r = imgData[i * 4];
    const g = imgData[i * 4 + 1];
    const b = imgData[i * 4 + 2];
    
    // Calcula o brilho de 0.0 a 1.0
    const brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    // Aplica a elevação Z
    const zElevation = (1 - brightness) * maxRelief + baseThickness;
    posAttribute.setZ(i, zElevation);
  }

  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: 0xe0e0e0,
    roughness: 0.4,
    metalness: 0.1,
    side: THREE.DoubleSide
  });

  currentMesh = new THREE.Mesh(geometry, material);
  scene.add(currentMesh);
}

// --- EVENTOS ---
document.getElementById('image-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      loadedImage = img;
      generate3DMesh();
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

heightSlider.addEventListener('input', (e) => {
  heightVal.textContent = e.target.value;
  generate3DMesh();
});

baseSlider.addEventListener('input', (e) => {
  baseVal.textContent = e.target.value;
  generate3DMesh();
});

// EXPORTAR STL
document.getElementById('export-btn').addEventListener('click', () => {
  if (!currentMesh) {
    alert('Carregue uma imagem primeiro!');
    return;
  }

  const exporter = new STLExporter();
  const result = exporter.parse(currentMesh, { binary: true });
  
  const blob = new Blob([result], { type: 'application/octet-stream' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'modelo_3d_impressao.stl';
  link.click();
});

// REORDER DIMENSIONS ON RESIZE
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ANIMATION LOOP
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();