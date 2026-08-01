import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './style.css';

/**
 * @class LithophaneApp
 * @description Aplicação WebGL para geração de Lithophanes e Bas-Relief 3D
 * com pré-processamento de imagens e fatiador G-Code integrado.
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
   * Configura o cenário 3D, câmera, renderizador WebGL e iluminação.
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

    // Iluminação Triangulada para destacar os relevos do modelo
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    
    const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
    mainLight.position.set(40, -40, 80);

    const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.5);
    fillLight.position.set(-40, 40, 50);

    this.scene.add(ambientLight, mainLight, fillLight);

    // Grid para simulação do Bed de Impressão (200x200 mm)
    const gridHelper = new THREE.GridHelper(200, 40, 0x38bdf8, 0x334155);
    gridHelper.rotation.x = Math.PI / 2;
    this.scene.add(gridHelper);
  }

  /**
   * Associa eventos do DOM aos métodos da aplicação.
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
   * Processa o arquivo enviado pelo usuário.
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
   * Aplica tratamento de imagem via Canvas (Filtros + Blur) e gera a Malha 3D.
   */
  generate3DMesh() {
    if (!this.loadedImgElement) return;

    // Limpeza de memória (Evita Memory Leaks de geometrias antigas)
    if (this.currentMesh) {
      this.scene.remove(this.currentMesh);
      this.currentMesh.geometry.dispose();
      this.currentMesh.material.dispose();
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const widthMM = parseFloat(document.getElementById('width-input').value) || 80;
    
    // Resolução da malha (200 vértices para capturar linhas e detalhes finos)
    const resX = 200; 
    const resY = Math.round((this.loadedImgElement.height / this.loadedImgElement.width) * resX);
    const heightMM = (this.loadedImgElement.height / this.loadedImgElement.width) * widthMM;

    canvas.width = resX;
    canvas.height = resY;

    // --- PROCESSAMENTO DE IMAGEM (Suavização para Linearts e Desenhos) ---
    // Aplica Blur Gaussiano no Canvas antes de ler a altura dos vértices
    ctx.filter = 'blur(1.8px) grayscale(100%)';
    ctx.drawImage(this.loadedImgElement, 0, 0, resX, resY);

    const imgData = ctx.getImageData(0, 0, resX, resY).data;

    const geometry = new THREE.PlaneGeometry(widthMM, heightMM, resX - 1, resY - 1);
    const pos = geometry.attributes.position;
    const maxZ = parseFloat(document.getElementById('height-slider').value);

    for (let i = 0; i < pos.count; i++) {
      const r = imgData[i * 4];
      const g = imgData[i * 4 + 1];
      const b = imgData[i * 4 + 2];

      // Cálculo da Luminância (Normalizada de 0.0 a 1.0)
      const brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      
      // Inversão: Linhas escuras elevam o relevo (Bas-Relief)
      let depth = (1 - brightness);

      // Curva Exponencial: Arredonda os picos para visual escultural
      depth = Math.pow(depth, 1.25);

      // Aplica a altura final Z + espessura base de 0.6mm
      pos.setZ(i, depth * maxZ + 0.6);
    }

    // Recalcula as normais para garantir um sombreamento suave das superfícies
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      roughness: 0.35,
      metalness: 0.05,
      flatShading: false
    });

    this.currentMesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.currentMesh);
  }

  /**
   * Fatiador de G-Code otimizado com rampa de profundidade suave.
   */
  exportGCode() {
    if (!this.loadedImgElement) {
      alert('Por favor, carregue uma imagem antes de gerar o G-Code.');
      return;
    }

    const temp = document.getElementById('temp-input').value || 200;
    const widthMM = parseFloat(document.getElementById('width-input').value) || 80;
    const heightMM = (this.loadedImgElement.height / this.loadedImgElement.width) * widthMM;
    const maxRelief = parseFloat(document.getElementById('height-slider').value);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Resolução do fatiamento em passos
    const stepsX = 100;
    const stepsY = Math.round((this.loadedImgElement.height / this.loadedImgElement.width) * stepsX);

    canvas.width = stepsX;
    canvas.height = stepsY;
    
    // Aplica o mesmo filtro de suavização para o corte G-Code
    ctx.filter = 'blur(1.8px) grayscale(100%)';
    ctx.drawImage(this.loadedImgElement, 0, 0, stepsX, stepsY);
    const imgData = ctx.getImageData(0, 0, stepsX, stepsY).data;

    let gcode = `; ================================================\n`;
    gcode += `; G-CODE GENERATED BY LITHOPHANE SLICER V2\n`;
    gcode += `; Dimensões do Modelo: ${widthMM.toFixed(1)}x${heightMM.toFixed(1)} mm\n`;
    gcode += `; ================================================\n`;
    gcode += `M104 S${temp} ; Aquecer bico extrusor\n`;
    gcode += `M109 S${temp} ; Aguardar estabilização de temperatura\n`;
    gcode += `G28 ; Home eixos XYZ\n`;
    gcode += `G90 ; Coordenadas Absolutas\n`;
    gcode += `M83 ; Extrusão Relativa\n`;
    gcode += `G1 Z2.0 F3000 ; Posiciona Z de segurança\n\n`;

    const feedRate = 1200; // Velocidade de impressão ideal para detalhes

    for (let y = 0; y < stepsY; y++) {
      const yPos = (y / stepsY) * heightMM + 20;

      for (let x = 0; x < stepsX; x++) {
        // Trajetória contínua Zig-Zag
        const actualX = (y % 2 === 0) ? x : (stepsX - 1 - x);
        const xPos = (actualX / stepsX) * widthMM + 20;

        const idx = (y * stepsX + actualX) * 4;
        const brightness = (0.299 * imgData[idx] + 0.587 * imgData[idx+1] + 0.114 * imgData[idx+2]) / 255;
        
        let depth = Math.pow(1 - brightness, 1.25);
        const zPos = depth * maxRelief + 0.4;

        gcode += `G1 X${xPos.toFixed(2)} Y${yPos.toFixed(2)} Z${zPos.toFixed(2)} E0.035 F${feedRate}\n`;
      }
    }

    // Encerramento
    gcode += `\n; Encerramento de Impressão\n`;
    gcode += `G1 E-2.0 F2400 ; Retração de filamento\n`;
    gcode += `G1 Z${(maxRelief + 10).toFixed(2)} F3000 ; Elevação do bico\n`;
    gcode += `M104 S0 ; Desligar aquecedor\n`;
    gcode += `M84 ; Desativar motores\n`;

    this.downloadFile(gcode, 'lithophane_modelo.gcode', 'text/plain');
  }

  /**
   * Força o download de arquivos texto no navegador.
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
   * Redimensionamento da janela.
   */
  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /**
   * Loop de renderização contínua.
   */
  animate() {
    requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

// Inicializa o app
new LithophaneApp();