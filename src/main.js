import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import './style.css';

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

    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, -150, 150);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    // Iluminação técnica de alto contraste
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
    keyLight.position.set(50, -80, 100);

    this.scene.add(ambientLight, keyLight);

    const gridHelper = new THREE.GridHelper(200, 40, 0x38bdf8, 0x334155);
    gridHelper.rotation.x = Math.PI / 2;
    this.scene.add(gridHelper);
  }

  initListeners() {
    const fileInput = document.getElementById('image-input');
    fileInput.setAttribute('accept', '.svg');
    
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

    if (file.name.endsWith('.svg') || file.type === 'image/svg+xml') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const svgText = e.target.result;
        const svgData = this.svgLoader.parse(svgText);
        this.lastSvgData = svgData;
        this.build3DFromSVG(svgData);
      };
      reader.readAsText(file);
    } else {
      alert('Por favor, envie um arquivo .SVG para usinar com precisão!');
    }
  }

  build3DFromSVG(svgData) {
    if (this.currentGroup) {
      this.scene.remove(this.currentGroup);
      this.currentGroup.traverse((child) => {
        if (child.isMesh) {
          child.geometry.dispose();
          child.material.dispose();
        }
      });
    }

    const depth = parseFloat(document.getElementById('height-slider').value) || 6;
    const group = new THREE.Group();
    const paths = svgData.paths;

    // Material com acabamento usinado limpo
    const material = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.2,
      metalness: 0.1,
      side: THREE.DoubleSide
    });

    paths.forEach((path) => {
      const shapes = SVGLoader.createShapes(path);

      shapes.forEach((shape) => {
        // Configuração de extrusão nítida sem arredondamentos excessivos
        const extrudeSettings = {
          depth: depth,
          bevelEnabled: true,
          bevelSegments: 2,
          steps: 1,
          bevelSize: 0.2,
          bevelThickness: 0.2
        };

        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        const mesh = new THREE.Mesh(geometry, material);
        group.add(mesh);
      });
    });

    // Centralizar e normalizar o tamanho da peça automaticamente na cena
    const box = new THREE.Box3().setFromObject(group);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    // Ajusta a escala para não estourar os limites da visualização (máximo 100mm)
    const maxDim = Math.max(size.x, size.y);
    const scale = maxDim > 0 ? 100 / maxDim : 1;

    group.scale.set(scale, -scale, 1); // Inverte Y do SVG
    group.position.x = -center.x * scale;
    group.position.y = center.y * scale;
    group.position.z = 0;

    // Criar Base Plana Ajustada ao Vetor
    const baseWidth = (size.x * scale) + 20;
    const baseHeight = (size.y * scale) + 20;
    const baseGeo = new THREE.BoxGeometry(baseWidth, baseHeight, 2);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.set(0, 0, -1);

    const masterGroup = new THREE.Group();
    masterGroup.add(baseMesh);
    masterGroup.add(group);

    this.currentGroup = masterGroup;
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