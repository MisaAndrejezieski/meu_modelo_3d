# 3D Lithophane & G-Code Generator

> Aplicação Web para conversão de imagens 2D em modelos volumétricos 3D (*Lithophanes*) com fatiamento algorítmico direto em código G-Code (ISO 6983) para impressoras 3D.

![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-yellow?style=for-the-badge&logo=javascript)
![Three.js](https://img.shields.io/badge/Three.js-WebGL-black?style=for-the-badge&logo=three.js)
![Vite](https://img.shields.io/badge/Vite-5.0-646CFF?style=for-the-badge&logo=vite)

---

## 📌 Sobre o Projeto

O **3D Lithophane Generator** é uma ferramenta interativa desenvolvida com tecnologia WebGL que permite a transformação de imagens bidimensionais em peças tridimensionais em tempo real. Além da visualização 3D, a aplicação possui um **mecanismo próprio de fatiamento (Slicer)** que converte a matriz de iluminação da imagem em rotas de extrusão para fabricação aditiva.

### 🌟 Principais Funcionalidades

* **Processamento 2D para 3D:** Mapeamento da matriz de pixels da imagem via Canvas API utilizando a fórmula de luminância relativa (ITU-R BT.601).
* **Renderização WebGL Interativa:** Visualização 3D da malha (*Mesh*) em tempo real com controle de órbita, iluminação dinâmica e simulação da mesa de impressão (*Bed*).
* **Controle Dinâmico de Parâmetros:** Ajuste em tempo real da largura do modelo, altura do relevo e temperatura do bico extrusor.
* **Fatiador G-Code Integrado (ISO 6983):** Algoritmo nativo em JavaScript que calcula trajetórias contínuas em padrão zig-zag para minimizar retração e otimizar o tempo de impressão.
* **Gerenciamento Eficiente de Memória:** Limpeza e descarte contínuo de geografias (*Geometry Disposing*) para prevenir *memory leaks* no navegador.

---

## 🛠️ Tecnologias Utilizadas

* **[Vite](https://vitejs.dev/):** Build tool de alta performance para o ambiente de desenvolvimento.
* **[Three.js](https://threejs.org/):** Biblioteca JavaScript 3D baseada em WebGL.
* **HTML5 Canvas API:** Leitura matricial e manipulação direta dos canais RGBA dos pixels da imagem.
* **CSS Glassmorphism:** Interface intuitiva com efeito translúcido e foco em UI/UX moderno.

---

## 📂 Estrutura do Projeto

```text
meu-modelo-3d/
├── public/              # Arquivos estáticos públicos
├── src/
│   ├── assets/          # Imagens e recursos estáticos
│   ├── main.js          # Ponto de entrada (Lógica Three.js, Canvas e Slicer POO)
│   └── style.css        # Estilização da UI e temas
├── .gitignore           # Arquivos e pastas ignorados pelo Git
├── index.html           # Estrutura DOM e carregamento da UI
├── package.json         # Manifesto de dependências do projeto
└── README.md            # Documentação da aplicação