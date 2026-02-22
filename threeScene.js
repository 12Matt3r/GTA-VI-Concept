import * as THREE from 'three';

let scene, camera, renderer, sphere;
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };
let rotation = { x: 0, y: 0 };
let touchStartPos = { x: 0, y: 0 };

// NEW: basic WASD locomotion state (desktop only)
const movementState = {
    forward: false,
    backward: false,
    left: false,
    right: false
};

// Use a single shared texture loader and track the current texture for cleanup
const textureLoader = new THREE.TextureLoader();
let currentTexture = null;

// NEW: world-space anchors for choice bubbles (inside the panorama sphere)
let bubbleAnchors = [];

// NEW: generate N random, well-separated points on the inner surface of the sphere
function generateSeparatedBubbleAnchors(count) {
    const anchors = [];
    const radius = 400; // slightly inside the sphere radius (500)
    const minAngle = Math.PI / 4; // minimum angular separation (~45 degrees)
    const maxAttempts = 200;

    function randomPointOnSphere() {
        const u = Math.random();
        const v = Math.random();
        const theta = 2 * Math.PI * u;
        const phi = Math.acos(2 * v - 1);
        const x = Math.sin(phi) * Math.cos(theta);
        const y = Math.cos(phi);
        const z = Math.sin(phi) * Math.sin(theta);
        return new THREE.Vector3(x, y, z).multiplyScalar(radius);
    }

    function isFarEnough(candidate) {
        if (anchors.length === 0) return true;
        const cNorm = candidate.clone().normalize();
        return anchors.every((existing) => {
            const eNorm = existing.clone().normalize();
            const dot = THREE.MathUtils.clamp(cNorm.dot(eNorm), -1, 1);
            const angle = Math.acos(dot);
            return angle >= minAngle;
        });
    }

    let attempts = 0;
    while (anchors.length < count && attempts < maxAttempts) {
        const candidate = randomPointOnSphere();
        if (isFarEnough(candidate)) {
            anchors.push(candidate);
        }
        attempts++;
    }

    // Fallback: if we couldn't place enough with separation, just fill remaining randomly
    while (anchors.length < count) {
        anchors.push(randomPointOnSphere());
    }

    return anchors;
}

// NEW: called by UI layer when new choice bubbles are created
export function setBubbleAnchors(count) {
    bubbleAnchors = generateSeparatedBubbleAnchors(count);
}

// NEW: helper to reposition choice bubbles every frame so they stay anchored in the panorama
function updateChoiceBubblePositions() {
    const container = document.getElementById('choice-bubbles');
    if (!container || !camera || !renderer || !bubbleAnchors.length) return;

    const bubbles = container.querySelectorAll('.choice-bubble');
    if (!bubbles.length) return;

    const canvas = renderer.domElement;
    const canvasWidth = canvas.clientWidth || window.innerWidth;
    const canvasHeight = canvas.clientHeight || window.innerHeight;

    bubbles.forEach((bubble, index) => {
        const anchor = bubbleAnchors[index % bubbleAnchors.length];
        if (!anchor) return;

        const projected = anchor.clone().project(camera);

        // If the point is behind the camera, hide this bubble
        if (projected.z > 1) {
            bubble.style.opacity = '0';
            bubble.style.pointerEvents = 'none';
            return;
        } else {
            bubble.style.opacity = '';
            bubble.style.pointerEvents = '';
        }

        // Convert normalized device coordinates to viewport percentages
        const ndcX = projected.x;
        const ndcY = projected.y;

        const xPx = (ndcX * 0.5 + 0.5) * canvasWidth;
        const yPx = (-ndcY * 0.5 + 0.5) * canvasHeight;

        const xPercent = (xPx / window.innerWidth) * 100;
        const yPercent = (yPx / window.innerHeight) * 100;

        bubble.style.left = `${xPercent}vw`;
        bubble.style.top = `${yPercent}vh`;
    });
}

export function initThreeJS() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.position.set(0, 0, 0.1);

    renderer = new THREE.WebGLRenderer({
        canvas: document.getElementById('scene-canvas'),
        antialias: true,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false
    });

    // NEW: size the renderer to match the visible canvas area (between top and bottom bars)
    const canvas = renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || window.innerWidth;
    const height = rect.height || window.innerHeight;

    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    const geometry = new THREE.SphereGeometry(500, 40, 30);
    geometry.scale(-1, 1, 1);

    const material = new THREE.MeshBasicMaterial({
        map: null,
        side: THREE.DoubleSide
    });

    sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);

    // Use the existing canvas reference for input events
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    // FIXED: listen for mousedown (not mousemove) to enable true drag-to-pan behavior
    canvas.addEventListener('mousedown', onMouseDown);

    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    canvas.addEventListener('touchstart', onTouchStart);

    window.addEventListener('resize', onWindowResize);

    // NEW: keyboard listeners for WASD walking (desktop)
    window.addEventListener('keydown', (event) => {
        switch (event.code) {
            case 'KeyW':
            case 'ArrowUp':
                movementState.forward = true;
                break;
            case 'KeyS':
            case 'ArrowDown':
                movementState.backward = true;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                movementState.left = true;
                break;
            case 'KeyD':
            case 'ArrowRight':
                movementState.right = true;
                break;
            default:
                break;
        }
    });

    window.addEventListener('keyup', (event) => {
        switch (event.code) {
            case 'KeyW':
            case 'ArrowUp':
                movementState.forward = false;
                break;
            case 'KeyS':
            case 'ArrowDown':
                movementState.backward = false;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                movementState.left = false;
                break;
            case 'KeyD':
            case 'ArrowRight':
                movementState.right = false;
                break;
            default:
                break;
        }
    });

    animate();
}

export function updatePanorama(imageUrl) {
    if (!imageUrl || !sphere) return;

    textureLoader.load(
        imageUrl,
        (newTexture) => {
            // Dispose of the old texture to free GPU memory
            if (currentTexture) {
                currentTexture.dispose();
            }
            currentTexture = newTexture;
            sphere.material.map = newTexture;
            sphere.material.needsUpdate = true;
        },
        undefined,
        (err) => {
            console.warn('Failed to load panorama texture:', err);
        }
    );
}

function onMouseDown(e) {
    isDragging = true;
    lastInputTime = Date.now();
    previousMousePosition = {
        x: e.clientX,
        y: e.clientY
    };
}

function onMouseMove(e) {
    if (!isDragging) return;
    
    lastInputTime = Date.now();
    const deltaX = e.clientX - previousMousePosition.x;
    const deltaY = e.clientY - previousMousePosition.y;

    // NEW: skip needless work if there was effectively no movement
    if (deltaX === 0 && deltaY === 0) return;

    rotation.y += deltaX * 0.005;
    rotation.x += deltaY * 0.005;
    rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotation.x));

    previousMousePosition = { x: e.clientX, y: e.clientY };
}

function onMouseUp() {
    isDragging = false;
}

function onTouchStart(e) {
    isDragging = true;
    touchStartPos = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY
    };
    previousMousePosition = { ...touchStartPos };
}

function onTouchMove(e) {
    if (!isDragging) return;
    e.preventDefault();

    const deltaX = e.touches[0].clientX - previousMousePosition.x;
    const deltaY = e.touches[0].clientY - previousMousePosition.y;

    // NEW: skip needless work if there was effectively no movement
    if (deltaX === 0 && deltaY === 0) return;

    rotation.y += deltaX * 0.005;
    rotation.x += deltaY * 0.005;
    rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotation.x));

    previousMousePosition = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY
    };
}

function onTouchEnd() {
    isDragging = false;
}

function onWindowResize() {
    if (!camera || !renderer) return;

    // NEW: recompute size based on the actual canvas area, not the full window
    const canvas = renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || window.innerWidth;
    const height = rect.height || window.innerHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    // Re-apply pixel ratio clamp on resize to keep performance stable
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
}

// NEW: Idle camera drift state
let lastInputTime = Date.now();
const IDLE_DRIFT_START_MS = 3000;

// NEW: apply simple WASD movement within a small radius inside the sphere
function updateCameraPositionForMovement() {
    if (!camera) return;

    const moveSpeed = 1.2; // tweak for how fast "walking" feels
    const maxRadius = 120;  // clamp movement to small room/hallway bounds

    const moveDir = new THREE.Vector3(0, 0, 0);

    if (movementState.forward) moveDir.z -= 1;
    if (movementState.backward) moveDir.z += 1;
    if (movementState.left) moveDir.x -= 1;
    if (movementState.right) moveDir.x += 1;

    if (moveDir.lengthSq() === 0) {
        // IDLE MOVEMENT: If no keys are pressed, check for mouse idle
        if (!isDragging && (Date.now() - lastInputTime > IDLE_DRIFT_START_MS)) {
            // Apply a very subtle sine wave breathing motion to the camera position
            // This makes the dream feel "alive" even when standing still
            const time = Date.now() * 0.0005;
            const breatheOffset = Math.sin(time) * 0.02; // slow bob
            
            // We apply this additively, but careful not to drift forever
            // Just oscillate y slightly
            camera.position.y += Math.cos(time * 0.5) * 0.003;
            
            // Also subtle rotation drift
            rotation.y += Math.sin(time * 0.3) * 0.00005;
        }
        return;
    }

    // Input detected, update last input time
    lastInputTime = Date.now();

    // Move relative to current yaw (rotation.y), keep y-level fixed
    moveDir.normalize();

    const yaw = rotation.y;
    const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).negate();

    const worldMove = new THREE.Vector3();
    worldMove.addScaledVector(forward, moveDir.z);
    worldMove.addScaledVector(right, moveDir.x);
    worldMove.normalize().multiplyScalar(moveSpeed);

    camera.position.add(worldMove);

    // Clamp camera to a small sphere around origin to keep the illusion stable
    const radius = camera.position.length();
    if (radius > maxRadius) {
        camera.position.multiplyScalar(maxRadius / radius);
    }
}

function animate() {
    requestAnimationFrame(animate);

    // NEW: Skip rendering work when the tab is hidden to save GPU/CPU
    if (typeof document !== 'undefined' && document.hidden) {
        return;
    }

    if (camera && renderer) {
        camera.rotation.order = 'YXZ';
        camera.rotation.y = rotation.y;
        camera.rotation.x = rotation.x;

        // NEW: update camera position based on WASD input before rendering
        updateCameraPositionForMovement();

        renderer.render(scene, camera);

        // NEW: keep choice bubbles anchored at their 3D positions as the camera moves
        updateChoiceBubblePositions();
    }
}