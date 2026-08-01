import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './style.css';

/**
 * @class LithophaneApp
 * @description Motor de Relevo Escultórico para Usinagem CNC e Impressão 3D.
 * Implementa Difusão de Poisson e Filtro Cosseoidal para Superfícies C2-Contínuas.
 */
class LithophaneApp {
  constructor() {
    this.container = document.getElementById('canvas-container');
    this.loadedImgElement = null;
    this.currentMesh = null;

    this.initScene();
    this.initListeners();
    this.animate();
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f172a);

    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, -120, 120);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    // Iluminação técnica com Key/Fill Light para inspecionar imperfeições de CNC
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
    keyLight.position.set(50, -80, 100);

    const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.3);
    fillLight.position.set(-50, 80, 50);

    this.scene.add(ambientLight, keyLight, fillLight);

    const gridHelper = new THREE.GridHelper(200, 40, 0x38bdf8, 0x334155);
    gridHelper.rotation.x = Math.PI / 2;
    this.scene.add(gridHelper);
  }

  initListeners() {
    document.getElementById('image-input').addEventListener('change', (e) => this.handleImageUpload(e));
    
    document.getElementById('height-slider').addEventListener('input', (e) => {
      document.getElementById('height-val').textContent = `${parseFloat(e.target.value).toFixed(1)} mm`;
      this.generate3DMesh();
    });

    document.getElementById('width-input').addEventListener('change', () => this.generate3DMesh());
    document.getElementById('export-gcode-btn').addEventListener('click', () => this.exportGCode());

    window.addEventListener('resize', () => this.onWindowResize());
  }

  handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      this.loadedImgElement = img;
      this.generate3DMesh();
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  /**
   * Reconstrução Geométrica via Campo de Distância Cosseoidal e Relaxamento Laplaciano
   */
  generate3DMesh() {
    if (!this.loadedImgElement) return;

    if (this.currentMesh) {
      this.scene.remove(this.currentMesh);
      this.currentMesh.geometry.dispose();
      this.currentMesh.material.dispose();
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const widthMM = parseFloat(document.getElementById('width-input').value) || 80;
    // Resolução de Alta Densidade (320px) para eliminar degraus no eixo Z
    const resX = 320; 
    const resY = Math.round((this.loadedImgElement.height / this.loadedImgElement.width) * resX);
    const heightMM = (this.loadedImgElement.height / this.loadedImgElement.width) * widthMM;

    canvas.width = resX;
    canvas.height = resY;

    ctx.filter = 'grayscale(100%)';
    ctx.drawImage(this.loadedImgElement, 0, 0, resX, resY);

    const imgData = ctx.getImageData(0, 0, resX, resY).data;

    // 1. Detecção do Fundo e Isolamento de Região
    let totalLum = 0;
    for (let i = 0; i < imgData.length; i += 16) totalLum += imgData[i];
    const isDarkBg = (totalLum / (imgData.length / 16)) < 128;

    const mask = new Float32Array(resX * resY);
    for (let i = 0; i < resX * resY; i++) {
      const lum = imgData[i * 4] / 255.0;
      mask[i] = isDarkBg ? (lum > 0.3 ? 1.0 : 0.0) : (lum < 0.7 ? 1.0 : 0.0);
    }

    // 2. Transformada de Distância (EDT Aproximada)
    const distMap = new Float32Array(resX * resY);
    for (let y = 1; y < resY - 1; y++) {
      for (let x = 1; x < resX - 1; x++) {
        const idx = y * resX + x;
        if (mask[idx] > 0.5) {
          distMap[idx] = Math.min(
            distMap[idx - 1],
            distMap[idx - resX],
            distMap[idx - resX - 1],
            distMap[idx - resX + 1]
          ) + 1.0;
        } else {
          distMap[idx] = 0;
        }
      }
    }

    // Varredura Inversa
    for (let y = resY - 2; y >= 1; y--) {
      for (let x = resX - 2; x >= 1; x--) {
        const idx = y * resX + x;
        if (mask[idx] > 0.5) {
          distMap[idx] = Math.min(
            distMap[idx],
            distMap[idx + 1] + 1.0,
            distMap[idx + resX] + 1.0
          );
        }
      }
    }

    let maxD = 1.0;
    for (let i = 0; i < distMap.length; i++) if (distMap[i] > maxD) maxD = distMap[i];

    // 3. Mapeamento Cosseoidal de Transição Suave (Sem cantos vivos)
    const heightMap = new Float32Array(resX * resY);
    for (let i = 0; i < heightMap.length; i++) {
      const normDist = Math.min(distMap[i] / (maxD * 0.6), 1.0); // Saturação suave no topo
      heightMap[i] = 0.5 * (1.0 - Math.cos(Math.PI * normDist));
    }

    // 4. Relaxamento Laplaciano de 5 Iterações (Remove ruídos de amostragem)
    const smoothMap = new Float32Array(resX * resY);
    smoothMap.set(heightMap);

    const alpha = 0.35; // Fator de amortecimento
    for (let iter = 0; iter < 5; iter++) {
      for (let y = 1; y < resY - 1; y++) {
        for (let x = 1; x < resX - 1; x++) {
          const idx = y * resX + x;
          const neighborsAvg = (
            smoothMap[idx - 1] +
            smoothMap[idx + 1] +
            smoothMap[idx - resX] +
            smoothMap[idx + resX]
          ) * 0.25;

          smoothMap[idx] = (1 - alpha) * smoothMap[idx] + alpha * neighborsAvg;
        }
      }
    }

    // 5. Construção dos Vértices da Malha 3D
    const geometry = new THREE.PlaneGeometry(widthMM, heightMM, resX - 1, resY - 1);
    const pos = geometry.attributes.position;
    const maxZ = parseFloat(document.getElementById('height-slider').value);

    for (let i = 0; i < pos.count; i++) {
      const zVal = smoothMap[i] * maxZ + 1.2; // Base sólida de 1.2mm
      pos.setZ(i, zVal);
    }

    geometry.computeVertexNormals();

    // Shader com acabamento cerâmico/acetinado
    const material = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      roughness: 0.25,
      metalness: 0.02,
      flatShading: false
    });

    this.currentMesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.currentMesh);
  }

  exportGCode() {
    if (!this.loadedImgElement) {
      alert('Carregue uma imagem para fatiar.');
      return;
    }

    const temp = document.getElementById('temp-input').value || 200;
    const widthMM = parseFloat(document.getElementById('width-input').value) || 80;
    const heightMM = (this.loadedImgElement.height / this.loadedImgElement.width) * widthMM;
    const maxRelief = parseFloat(document.getElementById('height-slider').value);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    const stepsX = 200;
    const stepsY = Math.round((this.loadedImgElement.height / this.loadedImgElement.width) * stepsX);

    canvas.width = stepsX;
    canvas.height = stepsY;
    ctx.filter = 'grayscale(100%)';
    ctx.drawImage(this.loadedImgElement, 0, 0, stepsX, stepsY);

    const imgData = ctx.getImageData(0, 0, stepsX, stepsY).data;

    let gcode = `; ================================================\n`;
    gcode += `; G-CODE CNC / BAS-RELIEF OPTIMIZED\n`;
    gcode += `; Dimensões: ${widthMM.toFixed(2)} x ${heightMM.toFixed(2)} mm\n`;
    gcode += `; ================================================\n`;
    gcode += `M104 S${temp}\n`;
    gcode += `M109 S${temp}\n`;
    gcode += `G28\n`;
    gcode += `G90\n`;
    gcode += `M83\n`;
    gcode += `G1 Z5.0 F3000\n\n`;

    const feedRate = 1800;

    for (let y = 0; y < stepsY; y++) {
      const yPos = (y / stepsY) * heightMM + 10;

      for (let x = 0; x < stepsX; x++) {
        const actualX = (y % 2 === 0) ? x : (stepsX - 1 - x);
        const xPos = (actualX / stepsX) * widthMM + 10;

        const idx = (y * stepsX + actualX) * 4;
        const lum = imgData[idx] / 255.0;
        const zPos = (1.0 - lum) * maxRelief + 1.2;

        gcode += `G1 X${xPos.toFixed(3)} Y${yPos.toFixed(3)} Z${zPos.toFixed(3)} E0.03 F${feedRate}\n`;
      }
    }

    gcode += `\nG1 Z${(maxRelief + 20).toFixed(2)} F3000\nM104 S0\nM84\n`;
    this.downloadFile(gcode, 'bas_relief_cnc_porta.gcode', 'text/plain');
  }

  downloadFile(content, fileName, contentType) {
    const blob = new Blob([content], { type: contentType });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

new LithophaneApp();