import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';

// --- CENA THREE.JS ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x18181c);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, -90, 90);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// --- ILUMINAÇÃO ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
dirLight.position.set(50, 50, 100);
scene.add(dirLight);

const dirLight2 = new THREE.DirectionalLight(0x4facfe, 1.2);
dirLight2.position.set(-50, -50, 50);
scene.add(dirLight2);

// Grid (Plano de Impressão)
const gridHelper = new THREE.GridHelper(150, 30, 0x4facfe, 0x444444);
gridHelper.rotation.x = Math.PI / 2;
scene.add(gridHelper);

// --- ESTADO GLOBAL ---
let currentMesh = null;
let loadedImgElement = null;

// Controls UI
const heightSlider = document.getElementById('height-slider');
const baseSlider = document.getElementById('base-slider');
const heightVal = document.getElementById('height-val');
const baseVal = document.getElementById('base-val');

// --- GERADOR DE GEOMETRIA EM ALTO-RELEVO ---
function generate3DMesh() {
  if (!loadedImgElement) return;

  if (currentMesh) {
    scene.remove(currentMesh);
    currentMesh.geometry.dispose();
    currentMesh.material.dispose();
    currentMesh = null;
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  const widthSegments = 120;
  const heightSegments = Math.round((loadedImgElement.height / loadedImgElement.width) * 120);

  canvas.width = widthSegments + 1;
  canvas.height = heightSegments + 1;

  ctx.drawImage(loadedImgElement, 0, 0, canvas.width, canvas.height);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  const width3D = 100; // 100mm de largura base
  const height3D = (loadedImgElement.height / loadedImgElement.width) * width3D;

  const geometry = new THREE.PlaneGeometry(width3D, height3D, widthSegments, heightSegments);
  const pos = geometry.attributes.position;

  const maxRelief = parseFloat(heightSlider.value);
  const baseThickness = parseFloat(baseSlider.value);

  for (let i = 0; i < pos.count; i++) {
    const r = imgData[i * 4];
    const g = imgData[i * 4 + 1];
    const b = imgData[i * 4 + 2];
    
    // Brilho
    const brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    
    // Z elevação para gerar o modelo 3D
    const z = (1 - brightness) * maxRelief + baseThickness;
    pos.setZ(i, z);
  }

  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: 0xdddddd,
    roughness: 0.3,
    metalness: 0.1,
    side: THREE.DoubleSide
  });

  currentMesh = new THREE.Mesh(geometry, material);
  scene.add(currentMesh);
  console.log("Modelo 3D gerado com sucesso!");
}

// --- CARREGAR IMAGEM ---
document.getElementById('image-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  const img = new Image();
  
  img.onload = () => {
    loadedImgElement = img;
    generate3DMesh();
    URL.revokeObjectURL(url);
  };

  img.onerror = (err) => {
    console.error("Erro ao carregar imagem:", err);
  };

  img.src = url;
});

// SLIDERS
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
    alert('Por favor, carregue uma imagem primeiro para gerar o modelo 3D!');
    return;
  }

  try {
    const exporter = new STLExporter();
    const result = exporter.parse(currentMesh, { binary: true });
    
    const blob = new Blob([result], { type: 'application/octet-stream' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'modelo_3d_impressao.stl';
    link.click();
  } catch (err) {
    console.error("Erro ao exportar STL:", err);
  }
});

// RESIZE
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// LOOP DE ANIMAÇÃO
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();