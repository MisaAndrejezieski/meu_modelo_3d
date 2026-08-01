import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './style.css';

/**
 * @class LithophaneApp
 * @description Aplicação WebGL profissional para conversão de imagens 2D / Lineart 
 * em relevo tridimensional (Bas-Relief) e fatiamento algorítmico em G-Code (ISO 6983).
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

  /**
   * Inicializa o ambiente 3D: Câmera, Renderizador WebGL e Sistema de Luzes Triangulado
   */
  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f172a);

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, -90, 90);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    // Iluminação Profissional para destacar relevos escultóricos
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.3);
    keyLight.position.set(50, -50, 80);

    const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.4);
    fillLight.position.set(-50, 50, 50);

    this.scene.add(ambientLight, keyLight, fillLight);

    // Simulação Visual da Mesa de Impressão (Bed 200x200 mm)
    const gridHelper = new THREE.GridHelper(200, 40, 0x38bdf8, 0x334155);
    gridHelper.rotation.x = Math.PI / 2;
    this.scene.add(gridHelper);
  }

  /**
   * Conecta a Interface do Usuário (DOM) com a lógica da aplicação
   */
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

  /**
   * Manipula o carregamento da imagem selecionada pelo usuário
   */
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
   * Processamento Matricial Avançado (Auto-Background + Kernel Filtering + Volumetric Curve)
   */
  generate3DMesh() {
    if (!this.loadedImgElement) return;

    // Descarte seguro para evitar vazamento de memória WebGL
    if (this.currentMesh) {
      this.scene.remove(this.currentMesh);
      this.currentMesh.geometry.dispose();
      this.currentMesh.material.dispose();
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const widthMM = parseFloat(document.getElementById('width-input').value) || 80;
    const resX = 220; // Alta densidade de malha para contornos suaves
    const resY = Math.round((this.loadedImgElement.height / this.loadedImgElement.width) * resX);
    const heightMM = (this.loadedImgElement.height / this.loadedImgElement.width) * widthMM;

    canvas.width = resX;
    canvas.height = resY;

    // 1. Renderiza a imagem inicial em escala de cinza
    ctx.filter = 'grayscale(100%)';
    ctx.drawImage(this.loadedImgElement, 0, 0, resX, resY);

    const imgData = ctx.getImageData(0, 0, resX, resY);
    const data = imgData.data;

    // 2. Análise Estatística para Detecção Automática de Fundo (Claro vs Escuro)
    let totalLum = 0;
    const sampleStep = 8;
    let samples = 0;
    
    for (let i = 0; i < data.length; i += 4 * sampleStep) {
      totalLum += (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      samples++;
    }
    const isDarkBackground = (totalLum / samples) < 128;

    // 3. Extração e Inversão Inteligente da Matriz de Altura
    const heightMap = new Float32Array(resX * resY);
    for (let y = 0; y < resY; y++) {
      for (let x = 0; x < resX; x++) {
        const idx = (y * resX + x) * 4;
        const lum = (0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]) / 255.0;
        
        // Garante que o desenho SEMPRE se projete para FORA do fundo
        heightMap[y * resX + x] = isDarkBackground ? lum : (1.0 - lum);
      }
    }

    // 4. Filtro de Suavização por Matriz de Kernel 5x5 (Remoção de Serrilhados)
    const smoothedMap = new Float32Array(resX * resY);
    const radius = 2;

    for (let y = 0; y < resY; y++) {
      for (let x = 0; x < resX; x++) {
        let sum = 0;
        let count = 0;

        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx;
            const ny = y + dy;

            if (nx >= 0 && nx < resX && ny >= 0 && ny < resY) {
              sum += heightMap[ny * resX + nx];
              count++;
            }
          }
        }
        smoothedMap[y * resX + x] = sum / count;
      }
    }

    // 5. Construção da Geometria Tridimensional no Three.js
    const geometry = new THREE.PlaneGeometry(widthMM, heightMM, resX - 1, resY - 1);
    const pos = geometry.attributes.position;
    const maxZ = parseFloat(document.getElementById('height-slider').value);

    for (let i = 0; i < pos.count; i++) {
      let rawVal = smoothedMap[i];

      // Aplicação da Curva Senoidal para Projeção Anatômica Volumétrica
      let shapedVal = Math.sin(rawVal * Math.PI * 0.5);

      // Z final: Elevação + Base sólida de 0.8mm
      pos.setZ(i, shapedVal * maxZ + 0.8);
    }

    geometry.computeVertexNormals();

    // Material Fosco de Alta Qualidade (Aparência de Porcelana/Mármore)
    const material = new THREE.MeshStandardMaterial({
      color: 0xebf1f5,
      roughness: 0.3,
      metalness: 0.05,
      flatShading: false
    });

    this.currentMesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.currentMesh);
  }

  /**
   * Fatiador de G-Code Sincronizado com o Algoritmo Volumétrico
   */
  exportGCode() {
    if (!this.loadedImgElement) {
      alert('Atenção: Por favor, carregue uma imagem antes de gerar o arquivo G-Code.');
      return;
    }

    const temp = document.getElementById('temp-input').value || 200;
    const widthMM = parseFloat(document.getElementById('width-input').value) || 80;
    const heightMM = (this.loadedImgElement.height / this.loadedImgElement.width) * widthMM;
    const maxRelief = parseFloat(document.getElementById('height-slider').value);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    const stepsX = 120;
    const stepsY = Math.round((this.loadedImgElement.height / this.loadedImgElement.width) * stepsX);

    canvas.width = stepsX;
    canvas.height = stepsY;
    ctx.filter = 'grayscale(100%)';
    ctx.drawImage(this.loadedImgElement, 0, 0, stepsX, stepsY);

    const imgData = ctx.getImageData(0, 0, stepsX, stepsY).data;

    // Análise de Fundo para o Fatiador
    let totalLum = 0;
    for (let i = 0; i < imgData.length; i += 16) {
      totalLum += (0.299 * imgData[i] + 0.587 * imgData[i + 1] + 0.114 * imgData[i + 2]);
    }
    const isDarkBackground = (totalLum / (imgData.length / 16)) < 128;

    let gcode = `; ================================================\n`;
    gcode += `; G-CODE GENERATED BY BAS-RELIEF SLICER V3\n`;
    gcode += `; Dimensões: ${widthMM.toFixed(1)}x${heightMM.toFixed(1)} mm\n`;
    gcode += `; ================================================\n`;
    gcode += `M104 S${temp} ; Aquecer bico\n`;
    gcode += `M109 S${temp} ; Estabilizar temperatura\n`;
    gcode += `G28 ; Home eixos\n`;
    gcode += `G90 ; Coordenadas absolutas\n`;
    gcode += `M83 ; Extrusão relativa\n`;
    gcode += `G1 Z2.0 F3000 ; Elevação de segurança\n\n`;

    const feedRate = 1200;

    for (let y = 0; y < stepsY; y++) {
      const yPos = (y / stepsY) * heightMM + 20;

      for (let x = 0; x < stepsX; x++) {
        const actualX = (y % 2 === 0) ? x : (stepsX - 1 - x);
        const xPos = (actualX / stepsX) * widthMM + 20;

        const idx = (y * stepsX + actualX) * 4;
        const lum = (0.299 * imgData[idx] + 0.587 * imgData[idx + 1] + 0.114 * imgData[idx + 2]) / 255.0;
        
        let val = isDarkBackground ? lum : (1.0 - lum);
        let shapedVal = Math.sin(val * Math.PI * 0.5);
        const zPos = shapedVal * maxRelief + 0.5;

        gcode += `G1 X${xPos.toFixed(2)} Y${yPos.toFixed(2)} Z${zPos.toFixed(2)} E0.035 F${feedRate}\n`;
      }
    }

    gcode += `\n; Encerramento de Impressão\n`;
    gcode += `G1 E-2.0 F2400 ; Retração\n`;
    gcode += `G1 Z${(maxRelief + 10).toFixed(2)} F3000 ; Elevação Z\n`;
    gcode += `M104 S0 ; Desligar aquecedor\n`;
    gcode += `M84 ; Desativar motores\n`;

    this.downloadFile(gcode, 'bas_relief_modelo.gcode', 'text/plain');
  }

  /**
   * Força o download de arquivos gerados
   */
  downloadFile(content, fileName, contentType) {
    const blob = new Blob([content], { type: contentType });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /**
   * Redimensionamento da Viewport
   */
  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /**
   * Loop principal de animação WebGL
   */
  animate() {
    requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

// Inicializa a aplicação
new LithophaneApp();