/**
 * TRANCECONNECT-PRIME: FUTURISTIC ANTI-GRAVITY TRANSPORT VEHICLE ENGINE
 * Ultra-realistic, 3D WebGL Anti-Gravity Freight Hauler (HyperHauler X-1)
 * Powered by Three.js with PBR Materials, Dynamic Volumetric Lighting,
 * 360° Inertial Orbit, Thruster Boost, Neon Customization & Telemetry.
 */

(function () {
  'use strict';

  // Global State & Controller Handles
  let scene, camera, renderer, animationFrameId;
  let vehicleRootGroup, vehicleFloatGroup, dockingPedestalGroup;
  let thrusterLights = [], emissiveNeonMeshes = [], plasmaBeams = [], groundFluxRings = [];
  let thrusterParticleSystem, ambientDustParticles;

  // Orbit & Mouse Interaction State
  let isDragging = false;
  let previousMousePosition = { x: 0, y: 0 };
  let spherical = {
    radius: 17,
    theta: 0.75, // yaw around Y axis
    phi: 1.15    // pitch angle from top pole (clamped)
  };
  let targetSpherical = { ...spherical };
  let velocity = { theta: 0, phi: 0 };
  let mouseNormalized = { x: 0, y: 0 };
  let targetTilt = { x: 0, z: 0 };
  let currentTilt = { x: 0, z: 0 };
  let autoRotate = true;
  let lastUserInteractionTime = Date.now();
  let isBoostActive = false;
  let boostTimer = null;
  let currentPaletteIndex = 0;
  let currentCameraAngleIndex = 0;

  // Color Palettes: [Primary Neon, Secondary Neon, Accent Light, Hex Value]
  const PALETTES = [
    {
      name: 'Cyber Cyan & Electric Violet',
      primary: 0x00f0ff,
      secondary: 0x9333ea,
      beam: 0x00e1ff,
      bodyAccent: 0x38bdf8
    },
    {
      name: 'Hyper Magenta & Solar Amber',
      primary: 0xf43f5e,
      secondary: 0xf59e0b,
      beam: 0xf43f5e,
      bodyAccent: 0xfb7185
    },
    {
      name: 'Matrix Emerald & Neon Mint',
      primary: 0x10b981,
      secondary: 0x06b6d4,
      beam: 0x10b981,
      bodyAccent: 0x34d399
    }
  ];

  // Camera Presets: [radius, theta, phi]
  const CAMERA_PRESETS = [
    { name: '3/4 Showcase Orbit', radius: 17.5, theta: 0.78, phi: 1.15 },
    { name: 'Front Aerodynamic', radius: 15.0, theta: 0.05, phi: 1.25 },
    { name: 'Side Highway Profile', radius: 18.0, theta: 1.57, phi: 1.28 },
    { name: 'Rear Ion Exhaust', radius: 16.5, theta: 3.14, phi: 1.20 },
    { name: 'Top-Down Isometric', radius: 22.0, theta: 0.78, phi: 0.55 }
  ];

  document.addEventListener('DOMContentLoaded', initVehicleViewer);

  function initVehicleViewer() {
    const container = document.getElementById('vehicle3DCanvasWrapper');
    if (!container) return;

    // WebGL Availability Check
    if (!checkWebGLSupport()) {
      showFallback();
      return;
    }

    try {
      setupScene(container);
      buildDockingPedestal();
      buildFuturisticVehicle();
      setupLighting();
      setupParticleSystems();
      setupInteractions(container);
      setupResizeHandler(container);
      animate(0);
      setupHudControls();
      console.log('⚡ TranceConnect HyperHauler X-1 3D Engine initialized successfully.');
    } catch (err) {
      console.error('Failed to initialize 3D Vehicle viewer:', err);
      showFallback();
    }
  }

  function checkWebGLSupport() {
    try {
      const canvas = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
    } catch (e) {
      return false;
    }
  }

  function showFallback() {
    const fallback = document.getElementById('vehicleFallback');
    if (fallback) fallback.style.display = 'flex';
  }

  // -------------------------------------------------------------------
  // 1. THREE.JS SCENE, CAMERA & RENDERER SETUP
  // -------------------------------------------------------------------
  function setupScene(container) {
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x060c18, 0.022);

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 520;

    camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    updateCameraPosition();

    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    // Attach to DOM
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Master Hierarchy
    vehicleRootGroup = new THREE.Group();
    vehicleFloatGroup = new THREE.Group();
    vehicleRootGroup.add(vehicleFloatGroup);
    scene.add(vehicleRootGroup);
  }

  // -------------------------------------------------------------------
  // 2. PROCEDURAL HIGH-TECH DOCKING PEDESTAL & REFLECTIVE GROUND
  // -------------------------------------------------------------------
  function buildDockingPedestal() {
    dockingPedestalGroup = new THREE.Group();

    // Octagonal Raised Platform Base
    const platformGeom = new THREE.CylinderGeometry(9.5, 10.2, 0.45, 8);
    const platformMat = new THREE.MeshStandardMaterial({
      color: 0x090f1d,
      roughness: 0.35,
      metalness: 0.9,
      flatShading: true
    });
    const platformMesh = new THREE.Mesh(platformGeom, platformMat);
    platformMesh.position.y = -0.22;
    platformMesh.receiveShadow = true;
    dockingPedestalGroup.add(platformMesh);

    // Glowing Platform Edge Rim
    const rimGeom = new THREE.CylinderGeometry(9.54, 9.54, 0.15, 8);
    const rimMat = new THREE.MeshBasicMaterial({
      color: PALETTES[0].primary,
      wireframe: false
    });
    const rimMesh = new THREE.Mesh(rimGeom, rimMat);
    rimMesh.position.y = 0.01;
    dockingPedestalGroup.add(rimMesh);
    emissiveNeonMeshes.push({ mesh: rimMesh, type: 'primary' });

    // Procedural Holographic Concentric Grid Texture (Canvas)
    const holoCanvas = document.createElement('canvas');
    holoCanvas.width = 1024;
    holoCanvas.height = 1024;
    const ctx = holoCanvas.getContext('2d');

    ctx.fillStyle = '#050a14';
    ctx.fillRect(0, 0, 1024, 1024);

    // Concentric Circular Tech Rings
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.35)';
    ctx.lineWidth = 3;
    [120, 240, 360, 440, 480].forEach(r => {
      ctx.beginPath();
      ctx.arc(512, 512, r, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Dashed Compass Rings & Tick Marks
    ctx.strokeStyle = 'rgba(147, 51, 234, 0.45)';
    ctx.lineWidth = 4;
    ctx.setLineDash([12, 16]);
    ctx.beginPath();
    ctx.arc(512, 512, 300, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Radial Crosshair Lines
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.18)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(512 + Math.cos(angle) * 80, 512 + Math.sin(angle) * 80);
      ctx.lineTo(512 + Math.cos(angle) * 480, 512 + Math.sin(angle) * 480);
      ctx.stroke();
    }

    // High-Tech Corner Chevron Accents
    ctx.fillStyle = 'rgba(0, 240, 255, 0.6)';
    for (let i = 0; i < 16; i++) {
      const angle = (i * Math.PI) / 8;
      const x = 512 + Math.cos(angle) * 440;
      const y = 512 + Math.sin(angle) * 440;
      ctx.fillRect(x - 4, y - 4, 8, 8);
    }

    const holoTex = new THREE.CanvasTexture(holoCanvas);
    holoTex.wrapS = THREE.ClampToEdgeWrapping;
    holoTex.wrapT = THREE.ClampToEdgeWrapping;

    const holoFloorGeom = new THREE.CircleGeometry(9.4, 48);
    const holoFloorMat = new THREE.MeshStandardMaterial({
      map: holoTex,
      roughness: 0.15,
      metalness: 0.85
    });
    const holoFloorMesh = new THREE.Mesh(holoFloorGeom, holoFloorMat);
    holoFloorMesh.rotation.x = -Math.PI / 2;
    holoFloorMesh.position.y = 0.02;
    holoFloorMesh.receiveShadow = true;
    dockingPedestalGroup.add(holoFloorMesh);

    // Ground Contact Ambient Occlusion Shadow Decal
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 512;
    shadowCanvas.height = 512;
    const sCtx = shadowCanvas.getContext('2d');
    const grad = sCtx.createRadialGradient(256, 256, 40, 256, 256, 250);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
    grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.45)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    sCtx.fillStyle = grad;
    sCtx.fillRect(0, 0, 512, 512);

    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    const shadowGeom = new THREE.PlaneGeometry(12, 8);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.8,
      depthWrite: false
    });
    const shadowMesh = new THREE.Mesh(shadowGeom, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.03;
    dockingPedestalGroup.add(shadowMesh);

    scene.add(dockingPedestalGroup);
  }

  // -------------------------------------------------------------------
  // 3. PROCEDURAL 3D ULTRA-REALISTIC VEHICLE (HyperHauler X-1)
  // -------------------------------------------------------------------
  function buildFuturisticVehicle() {
    // Premium Materials
    const matteBlackHull = new THREE.MeshStandardMaterial({
      color: 0x0c1018,
      roughness: 0.28,
      metalness: 0.85
    });

    const brushedChromeTrim = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.08,
      metalness: 0.98
    });

    const cockpitGlass = new THREE.MeshPhysicalMaterial({
      color: 0x021528,
      roughness: 0.04,
      metalness: 0.95,
      transparent: true,
      opacity: 0.90,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05
    });

    const neonCyan = new THREE.MeshBasicMaterial({
      color: PALETTES[0].primary
    });

    const neonPurple = new THREE.MeshBasicMaterial({
      color: PALETTES[0].secondary
    });

    const darkMechanicalParts = new THREE.MeshStandardMaterial({
      color: 0x181e2b,
      roughness: 0.5,
      metalness: 0.7
    });

    // ==========================================
    // A. CENTRAL LOWER CHASSIS & POWER KEEL
    // ==========================================
    const chassisGeom = new THREE.BoxGeometry(3.6, 0.65, 11.2);
    const chassisMesh = new THREE.Mesh(chassisGeom, darkMechanicalParts);
    chassisMesh.position.set(0, 0.95, -0.2);
    chassisMesh.castShadow = true;
    vehicleFloatGroup.add(chassisMesh);

    // Longitudinal Power Conduits (Neon Underglow Spine)
    [-1.65, 1.65].forEach(xOffset => {
      const conduitGeom = new THREE.CylinderGeometry(0.06, 0.06, 10.8, 8);
      const conduitMesh = new THREE.Mesh(conduitGeom, neonCyan);
      conduitMesh.rotation.x = Math.PI / 2;
      conduitMesh.position.set(xOffset, 0.72, -0.2);
      vehicleFloatGroup.add(conduitMesh);
      emissiveNeonMeshes.push({ mesh: conduitMesh, type: 'primary' });
    });

    // ==========================================
    // B. AERODYNAMIC STEALTH COCKPIT CABIN
    // ==========================================
    const cabinGroup = new THREE.Group();

    // Main Cab Lower Body (Swept Faceted Geometry)
    const cabLowerGeom = new THREE.BoxGeometry(3.8, 1.5, 4.2);
    const cabLowerMesh = new THREE.Mesh(cabLowerGeom, matteBlackHull);
    cabLowerMesh.position.set(0, 1.85, 3.2);
    cabLowerMesh.castShadow = true;
    cabinGroup.add(cabLowerMesh);

    // Sloped Stealth Nose Section
    const noseGeom = new THREE.CylinderGeometry(1.5, 1.9, 2.2, 4);
    const noseMesh = new THREE.Mesh(noseGeom, matteBlackHull);
    noseMesh.rotation.y = Math.PI / 4;
    noseMesh.rotation.x = -Math.PI / 2;
    noseMesh.position.set(0, 1.7, 5.2);
    noseMesh.scale.set(1.0, 0.7, 1.0);
    noseMesh.castShadow = true;
    cabinGroup.add(noseMesh);

    // Polished Chrome Front Splitter / Intake Winglet
    const splitterGeom = new THREE.BoxGeometry(3.9, 0.12, 1.2);
    const splitterMesh = new THREE.Mesh(splitterGeom, brushedChromeTrim);
    splitterMesh.position.set(0, 1.05, 5.6);
    splitterMesh.castShadow = true;
    cabinGroup.add(splitterMesh);

    // Front Neon Headlight Blades (Ultra-Bright Dual LED Strips)
    [-1.4, 1.4].forEach(xPos => {
      const headlightGeom = new THREE.BoxGeometry(0.55, 0.08, 0.85);
      const headlightMesh = new THREE.Mesh(headlightGeom, neonCyan);
      headlightMesh.position.set(xPos, 1.45, 5.4);
      headlightMesh.rotation.y = (xPos > 0 ? -1 : 1) * 0.22;
      cabinGroup.add(headlightMesh);
      emissiveNeonMeshes.push({ mesh: headlightMesh, type: 'primary' });
    });

    // Chrome Radiator Grille Inset with Illuminated Honeycomb Bar
    const grilleGeom = new THREE.BoxGeometry(2.4, 0.5, 0.15);
    const grilleMesh = new THREE.Mesh(grilleGeom, darkMechanicalParts);
    grilleMesh.position.set(0, 1.35, 5.85);
    cabinGroup.add(grilleMesh);

    const grilleAccent = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 0.18), neonCyan);
    grilleAccent.position.set(0, 1.35, 5.87);
    cabinGroup.add(grilleAccent);
    emissiveNeonMeshes.push({ mesh: grilleAccent, type: 'primary' });

    // Panoramic Polarized Cockpit Canopy / Glass Visor
    const visorGeom = new THREE.BoxGeometry(3.2, 0.95, 2.4);
    const visorMesh = new THREE.Mesh(visorGeom, cockpitGlass);
    visorMesh.position.set(0, 2.7, 3.4);
    visorMesh.castShadow = true;
    cabinGroup.add(visorMesh);

    // Inner Cockpit HUD Horizon Light
    const hudBar = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.04, 0.04), neonCyan);
    hudBar.position.set(0, 2.65, 4.4);
    cabinGroup.add(hudBar);
    emissiveNeonMeshes.push({ mesh: hudBar, type: 'primary' });

    // Aerodynamic Cabin Roof Cap & Sunken Air Channel
    const roofGeom = new THREE.BoxGeometry(3.4, 0.25, 2.8);
    const roofMesh = new THREE.Mesh(roofGeom, matteBlackHull);
    roofMesh.position.set(0, 3.25, 2.9);
    roofMesh.castShadow = true;
    cabinGroup.add(roofMesh);

    // Twin Roof Telemetry Sensor Fin Antennas
    [-1.2, 1.2].forEach(xPos => {
      const finGeom = new THREE.ConeGeometry(0.08, 0.65, 4);
      const finMesh = new THREE.Mesh(finGeom, brushedChromeTrim);
      finMesh.rotation.x = -0.3;
      finMesh.position.set(xPos, 3.55, 1.9);
      cabinGroup.add(finMesh);
    });

    vehicleFloatGroup.add(cabinGroup);

    // ==========================================
    // C. HEAVY MODULAR FREIGHT POD / CARGO BAY
    // ==========================================
    const cargoGroup = new THREE.Group();

    // Main Armor Container Shell
    const cargoMainGeom = new THREE.BoxGeometry(3.9, 2.65, 7.2);
    const cargoMainMesh = new THREE.Mesh(cargoMainGeom, matteBlackHull);
    cargoMainMesh.position.set(0, 2.35, -2.5);
    cargoMainMesh.castShadow = true;
    cargoMainMesh.receiveShadow = true;
    cargoGroup.add(cargoMainMesh);

    // Structural Rib Exoskeleton Trusses
    for (let z = -5.4; z <= 0.4; z += 1.4) {
      const ribGeom = new THREE.BoxGeometry(4.05, 2.78, 0.25);
      const ribMesh = new THREE.Mesh(ribGeom, brushedChromeTrim);
      ribMesh.position.set(0, 2.35, z);
      ribMesh.castShadow = true;
      cargoGroup.add(ribMesh);
    }

    // Glowing Lateral Energy Line Channels (Purple Cyber Accent)
    [-1.98, 1.98].forEach(xPos => {
      const lateralGlowGeom = new THREE.BoxGeometry(0.05, 0.12, 6.6);
      const lateralGlowMesh = new THREE.Mesh(lateralGlowGeom, neonPurple);
      lateralGlowMesh.position.set(xPos, 2.8, -2.5);
      cargoGroup.add(lateralGlowMesh);
      emissiveNeonMeshes.push({ mesh: lateralGlowMesh, type: 'secondary' });

      const lowerGlowMesh = new THREE.Mesh(lateralGlowGeom, neonCyan);
      lowerGlowMesh.position.set(xPos, 1.6, -2.5);
      cargoGroup.add(lowerGlowMesh);
      emissiveNeonMeshes.push({ mesh: lowerGlowMesh, type: 'primary' });
    });

    // Holographic Brand Inscription Plate on Cargo Flank
    const plateGeom = new THREE.BoxGeometry(0.08, 0.6, 2.8);
    [-1.99, 1.99].forEach(xPos => {
      const plateMesh = new THREE.Mesh(plateGeom, darkMechanicalParts);
      plateMesh.position.set(xPos, 2.25, -2.5);
      cargoGroup.add(plateMesh);

      const logoGlow = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.08, 2.2), neonCyan);
      logoGlow.position.set(xPos, 2.25, -2.5);
      cargoGroup.add(logoGlow);
      emissiveNeonMeshes.push({ mesh: logoGlow, type: 'primary' });
    });

    // Rear Full-Width Light Blade (Cyber Violet Tail Strip)
    const tailBladeGeom = new THREE.BoxGeometry(3.6, 0.15, 0.12);
    const tailBladeMesh = new THREE.Mesh(tailBladeGeom, neonPurple);
    tailBladeMesh.position.set(0, 3.4, -6.15);
    cargoGroup.add(tailBladeMesh);
    emissiveNeonMeshes.push({ mesh: tailBladeMesh, type: 'secondary' });

    // Rear Aero Diffusers
    const diffuserGeom = new THREE.BoxGeometry(3.4, 0.5, 0.8);
    const diffuserMesh = new THREE.Mesh(diffuserGeom, brushedChromeTrim);
    diffuserMesh.position.set(0, 1.1, -6.1);
    diffuserMesh.castShadow = true;
    cargoGroup.add(diffuserMesh);

    vehicleFloatGroup.add(cargoGroup);

    // ==========================================
    // D. 4x HEAVY ANTI-GRAVITY PROPULSION NACELLES
    // ==========================================
    // Quad Thruster Coordinates: [X, Z, Name]
    const thrusterPositions = [
      { x: -2.4, z: 2.8, name: 'FL' },
      { x:  2.4, z: 2.8, name: 'FR' },
      { x: -2.4, z: -4.4, name: 'RL' },
      { x:  2.4, z: -4.4, name: 'RR' }
    ];

    thrusterPositions.forEach((pos, idx) => {
      const nacelleGroup = new THREE.Group();
      nacelleGroup.position.set(pos.x, 1.15, pos.z);

      // Heavy Hydraulic Pylon Mounting Arm connecting to Chassis
      const pylonLength = 1.3;
      const pylonGeom = new THREE.BoxGeometry(pylonLength, 0.35, 0.65);
      const pylonMesh = new THREE.Mesh(pylonGeom, brushedChromeTrim);
      pylonMesh.position.set(pos.x > 0 ? -pylonLength / 2 : pylonLength / 2, 0.15, 0);
      pylonMesh.castShadow = true;
      nacelleGroup.add(pylonMesh);

      // Outer Armored Thruster Housing Shell
      const housingGeom = new THREE.CylinderGeometry(0.85, 0.95, 0.9, 16);
      const housingMesh = new THREE.Mesh(housingGeom, matteBlackHull);
      housingMesh.castShadow = true;
      nacelleGroup.add(housingMesh);

      // Polished Chrome Bevel Ring
      const chromeRingGeom = new THREE.TorusGeometry(0.88, 0.08, 12, 24);
      const chromeRingMesh = new THREE.Mesh(chromeRingGeom, brushedChromeTrim);
      chromeRingMesh.rotation.x = Math.PI / 2;
      chromeRingMesh.position.y = 0.42;
      nacelleGroup.add(chromeRingMesh);

      // Magnetic Levitation Plasma Coils (Glowing Inner Ring)
      const coilGeom = new THREE.TorusGeometry(0.72, 0.12, 12, 24);
      const coilMesh = new THREE.Mesh(coilGeom, neonCyan);
      coilMesh.rotation.x = Math.PI / 2;
      coilMesh.position.y = -0.32;
      nacelleGroup.add(coilMesh);
      emissiveNeonMeshes.push({ mesh: coilMesh, type: 'primary' });

      // Ion Core Emitter (Central Concentrated Energy Disc)
      const coreGeom = new THREE.CylinderGeometry(0.48, 0.48, 0.2, 16);
      const coreMesh = new THREE.Mesh(coreGeom, neonPurple);
      coreMesh.position.y = -0.35;
      nacelleGroup.add(coreMesh);
      emissiveNeonMeshes.push({ mesh: coreMesh, type: 'secondary' });

      // Translucent Downward Plasma Flux Cone
      const coneGeom = new THREE.ConeGeometry(1.4, 1.8, 24, 1, true);
      const coneMat = new THREE.MeshBasicMaterial({
        color: PALETTES[0].beam,
        transparent: true,
        opacity: 0.30,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const coneMesh = new THREE.Mesh(coneGeom, coneMat);
      coneMesh.position.y = -1.25;
      nacelleGroup.add(coneMesh);
      plasmaBeams.push(coneMesh);

      // Ground Projection Decal / Flux Ring on Platform Floor
      const groundRingGeom = new THREE.RingGeometry(0.8, 1.45, 32);
      const groundRingMat = new THREE.MeshBasicMaterial({
        color: PALETTES[0].primary,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const groundRingMesh = new THREE.Mesh(groundRingGeom, groundRingMat);
      groundRingMesh.rotation.x = -Math.PI / 2;
      groundRingMesh.position.set(pos.x, 0.05, pos.z);
      dockingPedestalGroup.add(groundRingMesh);
      groundFluxRings.push(groundRingMesh);

      // Dynamic Real-time PointLight Casting Downward Glow
      const pLight = new THREE.PointLight(PALETTES[0].primary, 2.4, 5.0, 2.0);
      pLight.position.set(0, -0.6, 0);
      nacelleGroup.add(pLight);
      thrusterLights.push(pLight);

      vehicleFloatGroup.add(nacelleGroup);
    });
  }

  // -------------------------------------------------------------------
  // 4. HIGH-TECH LIGHTING & CYBERPUNK ENVIRONMENT ATMOSPHERE
  // -------------------------------------------------------------------
  function setupLighting() {
    // Ambient Dark Cyan Space Light
    const ambientLight = new THREE.AmbientLight(0x0a1426, 1.4);
    scene.add(ambientLight);

    // Primary Cold Directional Key Light (Casting Soft Shadows)
    const keyLight = new THREE.DirectionalLight(0xdcf0fa, 2.2);
    keyLight.position.set(12, 18, 14);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 1.0;
    keyLight.shadow.camera.far = 45;
    keyLight.shadow.camera.left = -10;
    keyLight.shadow.camera.right = 10;
    keyLight.shadow.camera.top = 10;
    keyLight.shadow.camera.bottom = -10;
    keyLight.shadow.bias = -0.0006;
    scene.add(keyLight);

    // Electric Cyan Rim / Silhouette Light (Rear-Right)
    const rimLight = new THREE.DirectionalLight(0x00f0ff, 1.6);
    rimLight.position.set(-14, 8, -12);
    scene.add(rimLight);

    // Cyber Violet Fill Light from Low Angle
    const violetFill = new THREE.DirectionalLight(0x9333ea, 1.1);
    violetFill.position.set(10, 4, -10);
    scene.add(violetFill);

    // Forward Spotlights (Simulating Vehicle Beam on Dock)
    const leftHeadlight = new THREE.SpotLight(0x00f0ff, 3.5, 14, Math.PI / 6, 0.4, 1.8);
    leftHeadlight.position.set(-1.4, 2.5, 5.6);
    leftHeadlight.target.position.set(-1.4, 0, 14);
    scene.add(leftHeadlight);
    scene.add(leftHeadlight.target);

    const rightHeadlight = new THREE.SpotLight(0x00f0ff, 3.5, 14, Math.PI / 6, 0.4, 1.8);
    rightHeadlight.position.set(1.4, 2.5, 5.6);
    rightHeadlight.target.position.set(1.4, 0, 14);
    scene.add(rightHeadlight);
    scene.add(rightHeadlight.target);
  }

  // -------------------------------------------------------------------
  // 5. VOLUMETRIC CYBER DUST & THRUSTER PLASMA PARTICLE EMITTERS
  // -------------------------------------------------------------------
  function setupParticleSystems() {
    // A. Ambient Cyber Dust Spark Particles
    const dustCount = 180;
    const dustGeom = new THREE.BufferGeometry();
    const dustPositions = new Float32Array(dustCount * 3);

    for (let i = 0; i < dustCount * 3; i += 3) {
      dustPositions[i] = (Math.random() - 0.5) * 26;
      dustPositions[i + 1] = Math.random() * 9;
      dustPositions[i + 2] = (Math.random() - 0.5) * 26;
    }
    dustGeom.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));

    // Particle Disc Texture Generator
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 64;
    pCanvas.height = 64;
    const pCtx = pCanvas.getContext('2d');
    const pGrad = pCtx.createRadialGradient(32, 32, 2, 32, 32, 30);
    pGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    pGrad.addColorStop(0.3, 'rgba(0, 240, 255, 0.85)');
    pGrad.addColorStop(1, 'rgba(0, 240, 255, 0)');
    pCtx.fillStyle = pGrad;
    pCtx.fillRect(0, 0, 64, 64);

    const pTex = new THREE.CanvasTexture(pCanvas);

    const dustMat = new THREE.PointsMaterial({
      size: 0.35,
      map: pTex,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    ambientDustParticles = new THREE.Points(dustGeom, dustMat);
    scene.add(ambientDustParticles);

    // B. Thruster Plasma Flux Particle Emitters
    const thrusterParticleCount = 120;
    const tpGeom = new THREE.BufferGeometry();
    const tpPositions = new Float32Array(thrusterParticleCount * 3);

    for (let i = 0; i < thrusterParticleCount * 3; i += 3) {
      tpPositions[i] = (Math.random() - 0.5) * 6;
      tpPositions[i + 1] = Math.random() * 1.5;
      tpPositions[i + 2] = (Math.random() - 0.5) * 8;
    }
    tpGeom.setAttribute('position', new THREE.BufferAttribute(tpPositions, 3));

    const tpMat = new THREE.PointsMaterial({
      size: 0.28,
      map: pTex,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    thrusterParticleSystem = new THREE.Points(tpGeom, tpMat);
    vehicleFloatGroup.add(thrusterParticleSystem);
  }

  // -------------------------------------------------------------------
  // 6. INTERACTIVE 360° ORBIT, MOUSE PARALLAX & TOUCH CONTROLS
  // -------------------------------------------------------------------
  function setupInteractions(container) {
    // Mouse Down / Touch Start
    const onStart = (clientX, clientY) => {
      isDragging = true;
      previousMousePosition = { x: clientX, y: clientY };
      velocity = { theta: 0, phi: 0 };
      lastUserInteractionTime = Date.now();
    };

    // Mouse Move / Touch Move
    const onMove = (clientX, clientY) => {
      // Calculate Normalized Mouse for Parallax / Tilt
      const rect = container.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((clientY - rect.top) / rect.height) * 2 - 1);
      mouseNormalized.x = Math.max(-1, Math.min(1, x));
      mouseNormalized.y = Math.max(-1, Math.min(1, y));

      targetTilt.z = -mouseNormalized.x * 0.08;
      targetTilt.x = mouseNormalized.y * 0.05;

      if (!isDragging) return;

      const deltaX = clientX - previousMousePosition.x;
      const deltaY = clientY - previousMousePosition.y;

      const rotSpeed = 0.0065;
      targetSpherical.theta -= deltaX * rotSpeed;
      targetSpherical.phi -= deltaY * rotSpeed;

      // Clamp pitch so camera stays in cinematic perspective
      targetSpherical.phi = Math.max(0.25, Math.min(1.42, targetSpherical.phi));

      velocity.theta = -deltaX * rotSpeed * 0.45;
      velocity.phi = -deltaY * rotSpeed * 0.45;

      previousMousePosition = { x: clientX, y: clientY };
      lastUserInteractionTime = Date.now();
    };

    const onEnd = () => {
      isDragging = false;
      lastUserInteractionTime = Date.now();
    };

    // Mouse Listeners
    container.addEventListener('mousedown', (e) => onStart(e.clientX, e.clientY));
    window.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', onEnd);

    // Touch Listeners
    container.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        onStart(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1) {
        onMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    window.addEventListener('touchend', onEnd);

    // Mouse Wheel Zoom Clamp
    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      targetSpherical.radius += e.deltaY * 0.012;
      targetSpherical.radius = Math.max(11, Math.min(26, targetSpherical.radius));
      lastUserInteractionTime = Date.now();
    }, { passive: false });
  }

  function updateCameraPosition() {
    // Spherical to Cartesian Coordinates
    const sinPhiRadius = Math.sin(spherical.phi) * spherical.radius;
    camera.position.x = sinPhiRadius * Math.sin(spherical.theta);
    camera.position.y = Math.cos(spherical.phi) * spherical.radius;
    camera.position.z = sinPhiRadius * Math.cos(spherical.theta);
    camera.lookAt(0, 1.8, 0);
  }

  function setupResizeHandler(container) {
    const handleResize = () => {
      if (!renderer || !camera || !container) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width === 0 || height === 0) return;

      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);
  }

  // -------------------------------------------------------------------
  // 7. REAL-TIME ANIMATION LOOP (Hover Physics, Particles & Inertia)
  // -------------------------------------------------------------------
  function animate(timestamp) {
    animationFrameId = requestAnimationFrame(animate);

    const time = timestamp * 0.001;

    // A. Idle Auto-Rotation Inertia
    const now = Date.now();
    if (!isDragging && autoRotate && (now - lastUserInteractionTime > 1800)) {
      targetSpherical.theta += 0.0035;
    }

    // Apply Inertial Velocity Drag
    if (!isDragging) {
      targetSpherical.theta += velocity.theta;
      targetSpherical.phi += velocity.phi;
      velocity.theta *= 0.91;
      velocity.phi *= 0.91;
    }

    // Smooth Spherical Damping towards Target
    spherical.theta += (targetSpherical.theta - spherical.theta) * 0.09;
    spherical.phi += (targetSpherical.phi - spherical.phi) * 0.09;
    spherical.radius += (targetSpherical.radius - spherical.radius) * 0.09;

    updateCameraPosition();

    // B. Anti-Gravity Floating Physics (Vertical Hover + Natural Pitch/Roll Breathing)
    const baseAltitude = isBoostActive ? 2.15 : 1.35;
    const hoverAmplitude = isBoostActive ? 0.28 : 0.14;
    const hoverY = Math.sin(time * 2.4) * hoverAmplitude + Math.cos(time * 1.5) * 0.04;

    vehicleFloatGroup.position.y = baseAltitude + hoverY;

    // Subtle Natural Hover Breathing (Slight Pitch & Banking)
    const naturalPitch = Math.sin(time * 1.8) * 0.022;
    const naturalRoll = Math.cos(time * 1.2) * 0.018;

    // Smooth Mouse Tilt Interpolation
    currentTilt.x += (targetTilt.x - currentTilt.x) * 0.06;
    currentTilt.z += (targetTilt.z - currentTilt.z) * 0.06;

    vehicleFloatGroup.rotation.x = naturalPitch + currentTilt.x;
    vehicleFloatGroup.rotation.z = naturalRoll + currentTilt.z;

    // C. Thruster Flux Dynamics (Pulsing Energy, Scaling Beams)
    const pulseFactor = 1.0 + Math.sin(time * 6.0) * 0.12 + (isBoostActive ? 0.35 : 0.0);

    plasmaBeams.forEach(beam => {
      beam.scale.set(pulseFactor, 1.0 + Math.sin(time * 4.0) * 0.15, pulseFactor);
      beam.material.opacity = (isBoostActive ? 0.55 : 0.28) + Math.sin(time * 8.0) * 0.08;
    });

    groundFluxRings.forEach(ring => {
      ring.scale.setScalar(pulseFactor * (isBoostActive ? 1.4 : 1.0));
      ring.material.opacity = (isBoostActive ? 0.8 : 0.45) + Math.sin(time * 5.0) * 0.12;
    });

    thrusterLights.forEach(light => {
      light.intensity = (isBoostActive ? 5.5 : 2.4) + Math.sin(time * 7.0) * 0.4;
    });

    // D. Animate Holographic Floor Rings
    if (dockingPedestalGroup) {
      // Very gentle rotation of the docking pedestal holographic floor
      dockingPedestalGroup.children[2].rotation.z = time * 0.02;
    }

    // E. Ambient Particle Drifting
    if (ambientDustParticles) {
      const positions = ambientDustParticles.geometry.attributes.position.array;
      for (let i = 1; i < positions.length; i += 3) {
        positions[i] += 0.012;
        if (positions[i] > 9.5) positions[i] = 0.2;
      }
      ambientDustParticles.geometry.attributes.position.needsUpdate = true;
      ambientDustParticles.rotation.y = time * 0.015;
    }

    // F. Thruster Plasma Stream Particles
    if (thrusterParticleSystem) {
      const pArr = thrusterParticleSystem.geometry.attributes.position.array;
      for (let i = 1; i < pArr.length; i += 3) {
        pArr[i] -= 0.035;
        if (pArr[i] < -0.8) {
          pArr[i] = 1.2;
          pArr[i - 1] += (Math.random() - 0.5) * 0.2;
          pArr[i + 1] += (Math.random() - 0.5) * 0.2;
        }
      }
      thrusterParticleSystem.geometry.attributes.position.needsUpdate = true;
    }

    // Update Telemetry Displays
    updateTelemetryReadouts(vehicleFloatGroup.position.y);

    renderer.render(scene, camera);
  }

  function updateTelemetryReadouts(currentY) {
    const altEl = document.getElementById('teleAltitude');
    if (altEl) {
      altEl.textContent = `${(currentY * 0.95).toFixed(2)} M`;
    }

    const energyEl = document.getElementById('teleEnergy');
    if (energyEl && isBoostActive) {
      energyEl.textContent = '145% OVERCLOCK';
      energyEl.style.color = '#f43f5e';
    } else if (energyEl) {
      energyEl.textContent = '99.4% STABLE';
      energyEl.style.color = 'var(--cyan)';
    }
  }

  // -------------------------------------------------------------------
  // 8. INTERACTIVE HUD CONTROLLER (Boost, Palette, Views, Orbit)
  // -------------------------------------------------------------------
  function setupHudControls() {
    window.toggleAutoRotate = () => {
      autoRotate = !autoRotate;
      const btn = document.getElementById('btnHudAutoRotate');
      if (btn) btn.classList.toggle('active', autoRotate);
      lastUserInteractionTime = Date.now();
    };

    window.triggerThrusterBoost = () => {
      if (isBoostActive) return;
      isBoostActive = true;
      const btn = document.getElementById('btnHudBoost');
      if (btn) btn.classList.add('active');

      const modeEl = document.getElementById('teleMode');
      if (modeEl) {
        modeEl.textContent = 'TURBO THRUST';
        modeEl.style.color = '#f43f5e';
      }

      clearTimeout(boostTimer);
      boostTimer = setTimeout(() => {
        isBoostActive = false;
        if (btn) btn.classList.remove('active');
        if (modeEl) {
          modeEl.textContent = 'ANTI-GRAV FTL';
          modeEl.style.color = '#a78bfa';
        }
      }, 3000);
    };

    window.cycleNeonPalette = () => {
      currentPaletteIndex = (currentPaletteIndex + 1) % PALETTES.length;
      const pal = PALETTES[currentPaletteIndex];

      // Update Emissive Meshes
      emissiveNeonMeshes.forEach(item => {
        const color = item.type === 'primary' ? pal.primary : pal.secondary;
        if (item.mesh.material) {
          item.mesh.material.color.setHex(color);
        }
      });

      // Update Plasma Beams
      plasmaBeams.forEach(b => {
        b.material.color.setHex(pal.beam);
      });

      // Update Ground Flux Rings
      groundFluxRings.forEach(r => {
        r.material.color.setHex(pal.primary);
      });

      // Update Thruster Point Lights
      thrusterLights.forEach(l => {
        l.color.setHex(pal.primary);
      });

      // Show toast alert
      if (window.showToast) {
        window.showToast(`Neon Light Scheme: ${pal.name}`, 'info', 2500);
      }
    };

    window.cycleCameraAngle = () => {
      currentCameraAngleIndex = (currentCameraAngleIndex + 1) % CAMERA_PRESETS.length;
      const preset = CAMERA_PRESETS[currentCameraAngleIndex];

      targetSpherical.radius = preset.radius;
      targetSpherical.theta = preset.theta;
      targetSpherical.phi = preset.phi;
      lastUserInteractionTime = Date.now();

      if (window.showToast) {
        window.showToast(`Camera Angle: ${preset.name}`, 'info', 2000);
      }
    };
  }

})();
