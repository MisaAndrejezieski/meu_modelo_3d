import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import './style.css';

/**
 * @class LithophaneApp
 * @description Engine Profissional de Extrusão e Relief Vetorial (SVG to 3D/CNC)
 */
class LithophaneApp {
  constructor() {
    this.container = document.getElementById('canvas-container');
    this.currentGroup = null;
    this.svgLoader = new SVGLoader();

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
    this.camera.position.set(0, -150, 150);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    // Iluminação técnica de estúdio para validação de quinas e superfícies
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
    keyLight.position.set(40, -80, 120);

    const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.4);
    fillLight.position.set(-40, 80, 60);

    this.scene.add(ambientLight, keyLight, fillLight);

    const gridHelper = new THREE.GridHelper(200, 40, 0x38bdf8, 0x334155);
    gridHelper.rotation.x = Math.PI / 2;
    this.scene.add(gridHelper);
  }

  initListeners() {
    const fileInput = document.getElementById('image-input');
    // Aceita tanto SVG quanto formatos de imagem tradicionais
    fileInput.setAttribute('accept', '.svg, .png, .jpg, .jpeg');
    
    fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
    
    document.getElementById('height-slider').addEventListener('input', (e) => {
      document.getElementById('height-val').textContent = `${parseFloat(e.target.value).toFixed(1)} mm`;
      if (this.lastSvgData) this.build3DFromSVG(this.lastSvgData);
    });

    window.addEventListener('resize', () => this.onWindowResize());
  }

  handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.type === 'image/svg+xml' || file.name.endsWith('.svg')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const svgText = e.target.result;
        const svgData = this.svgLoader.parse(svgText);
        this.lastSvgData = svgData;
        this.build3DFromSVG(svgData);
      };
      reader.readAsText(file);
    } else {
      alert('Para precisão absoluta de letras em CNC, utilize um arquivo .SVG!');
    }
  }

  /**
   * Converte Caminhos Vetoriais (Paths/Bézier) em Solidos 3D sem Perda de Resolução
   */
  build3DFromSVG(svgData) {
    if (this.currentGroup) {
      this.scene.remove(this.currentGroup);
      // Limpeza de memória GPU
      this.currentGroup.traverse((child) => {
        if (child.isMesh) {
          child.geometry.dispose();
          child.material.dispose();
        }
      });
    }

    const depth = parseFloat(document.getElementById('height-slider').value) || 5;
    const group = new THREE.Group();
    const paths = svgData.paths;

    // 1. Criar Placa Base Plana (MDF / Madeira)
    const baseWidth = 100;
    const baseHeight = 120;
    const baseGeo = new THREE.BoxGeometry(baseWidth, baseHeight, 2); // Base sólida de 2mm
    const baseMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.4 });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.z = 1;
    group.add(baseMesh);

    // 2. Extrusão dos Caminhos Vetoriais (Letras, Escudos e Bordas)
    paths.forEach((path) => {
      const shapes = SVGLoader.createShapes(path);

      shapes.forEach((shape) => {
        // Opções de Extrusão Industrial (Com chanro/bessil para fresa Ball-Nose/V-Carve)
        const extrudeSettings = {
          depth: depth,
          bevelEnabled: true,
          bevelSegments: 3,
          steps: 1,
          bevelSize: 0.4,   // Chanfro para a fresa entalhar suavemente
          bevelThickness: 0.4
        };

        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        geometry.center(); // Centraliza o vetor na placa

        // Inverte eixo Y pois coordenadas SVG são invertidas em relação ao WebGL
        geometry.scale(0.2, -0.2, 1); 

        const material = new THREE.MeshStandardMaterial({
          color: 0x0284c7, // Destaque azul para o entalhe vetorial
          roughness: 0.2,
          metalness: 0.1,
          flatShading: false
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.z = 2 + (depth / 2); // Posiciona o relevo exatamente sobre a base
        group.add(mesh);
      });
    });

    this.currentGroup = group;
    this.scene.add(this.currentGroup);
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