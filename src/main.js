import * as BABYLON from 'babylonjs';
import 'babylonjs-loaders';
import { createNoise3D } from 'simplex-noise';

// ===== BABYLON.JS SETUP =====
const canvas = document.getElementById("renderCanvas");
const engine = new BABYLON.Engine(canvas, true, { stencil: true });

// New code: Create and initialize the scene once
const scene = new BABYLON.Scene(engine);
scene.clearColor = new BABYLON.Color4(0, 0, 0, 1);

// ===== CAMERA =====
const camera = new BABYLON.ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 2.5, 50, BABYLON.Vector3.Zero(), scene);
camera.attachControl(canvas, true);
camera.lowerRadiusLimit = 10;
camera.upperRadiusLimit = 500;

// ===== LIGHTING =====
const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(1, 1, 0), scene);
light.intensity = 0.7;

// ===== OPTIMIZED STAR FIELD =====
const starCount = 10000;
const starPositions = new Float32Array(starCount * 3);
const starColors = new Float32Array(starCount * 4);

// Pre-compute star positions and colors
for (let i = 0; i < starCount; i++) {
    const idx = i * 3;
    const colorIdx = i * 4;
    
    // Random positions in a sphere
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = Math.pow(Math.random(), 1/3) * 500; // Cube root for more uniform distribution
    
    starPositions[idx] = r * Math.sin(phi) * Math.cos(theta);
    starPositions[idx + 1] = r * Math.sin(phi) * Math.sin(theta);
    starPositions[idx + 2] = r * Math.cos(phi);
    
    // Use random brightness for a twinkling effect
    const brightness = 0.5 + Math.random() * 0.5;
    starColors[colorIdx] = brightness;
    starColors[colorIdx + 1] = brightness;
    starColors[colorIdx + 2] = brightness;
    starColors[colorIdx + 3] = 1.0;
}

// Create star system using point clouds for better performance
const starSystem = new BABYLON.PointsCloudSystem("stars", 1, scene);
starSystem.addPoints(starCount, (particle, i) => {
    const idx = i * 3;
    const colorIdx = i * 4;
    particle.position = new BABYLON.Vector3(
        starPositions[idx],
        starPositions[idx + 1],
        starPositions[idx + 2]
    );
    particle.color = new BABYLON.Color4(
        starColors[colorIdx],
        starColors[colorIdx + 1],
        starColors[colorIdx + 2],
        starColors[colorIdx + 3]
    );
});
starSystem.buildMeshAsync().then(() => {
    // Removed star field rotation to avoid excessive blinking while dragging.
});
function fract(x) {
    return x - Math.floor(x);
}

// ===== SPACE DUST =====
let spaceDust; // Declare spaceDust in outer scope

// Replacing sphere-based space dust with 500 triangles with ramped gradients
{
    const triangleCount = 6000;
    const positions = [];
    const colors = [];
    const indices = [];
    const uvs = []; // New array for UV coordinates
    let vertexIndex = 0;
    for (let i = 0; i < triangleCount; i++) {
        // Base position on a spherical shell (radius between 300 and 500) with clustering via Perlin noise
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const radius = 300 + Math.random() * 200;
        const noise3DForDust = createNoise3D(Math.random);
        const noiseVal = noise3DForDust(theta, phi, 0.0);
        const adjustedRadius = radius + noiseVal * 50.0;
        const baseX = adjustedRadius * Math.sin(phi) * Math.cos(theta);
        const baseY = adjustedRadius * Math.sin(phi) * Math.sin(theta);
        const baseZ = adjustedRadius * Math.cos(phi);
        
        // Generate 3 vertices for this triangle with larger random offsets
        for (let j = 0; j < 3; j++) {
            const offsetX = (Math.random() - 0.5) * 10;
            const offsetY = (Math.random() - 0.5) * 10;
            const offsetZ = (Math.random() - 0.5) * 10;
            const vx = baseX + offsetX;
            const vy = baseY + offsetY;
            const vz = baseZ + offsetZ;
            positions.push(vx, vy, vz);
            // Compute UV using vx and vy to yield more variation in the horizontal gradient
            uvs.push(fract(vx / 50.0), fract(vy / 50.0));
        }
        
        // Assign gradient colors: blue, purple, and a blended mix
        colors.push(0.2, 0.4, 1.0, 1.0); // Blue
        colors.push(0.6, 0.1, 0.8, 1.0); // Purple
        colors.push(0.4, 0.25, 0.9, 1.0); // Mixed
        
        // Define indices for the triangle
        indices.push(vertexIndex, vertexIndex + 1, vertexIndex + 2);
        vertexIndex += 3;
    }
    
    // Create custom mesh for space dust
    spaceDust = new BABYLON.Mesh("spaceDust", scene);
    const vertexData = new BABYLON.VertexData();
    vertexData.positions = positions;
    vertexData.indices = indices;
    vertexData.colors = colors;
    vertexData.uvs = uvs;  // Assign UVs for gradient
    vertexData.applyToMesh(spaceDust, true);
    
    // Create shader material with extra params for space dust
    const spaceDustShader = new BABYLON.ShaderMaterial("spaceDustShader", scene, {
        vertexSource: `
            precision highp float;
            attribute vec3 position;
            attribute vec2 uv;
            uniform mat4 worldViewProjection;
            varying vec2 vUV;
            void main(void) {
                vUV = uv;
                gl_Position = worldViewProjection * vec4(position, 1.0);
            }
        `,
        fragmentSource: `
            precision highp float;
            uniform float time;
            uniform vec3 gradientStart;
            uniform vec3 gradientEnd;
            uniform float noiseFactor;
            varying vec2 vUV;
            
            void main(void) {
                // Calculate distance from the center of our UV space (assumed center at 0.5,0.5)
                vec2 center = vec2(0.5, 0.5);
                float d = distance(vUV, center);
                
                // Compute a time-dependent warp effect using both UV components
                float warp = sin((vUV.x + vUV.y + time) * 10.0) * 0.5 + 0.5;
                
                // Mix the warp with the horizontal gradient based on the noise factor:
                float mixFactor = mix(warp, vUV.x, noiseFactor);
                
                // The "warped" color is a mix between our two defined colors
                vec3 warpedColor = mix(gradientStart, gradientEnd, mixFactor);
                
                // Near the edges (d approaching 0.5), enforce a linear ramp so that the dust is fully opaque
                float edge = smoothstep(0.45, 0.5, d);
                
                // Final color blends the warped and linear gradient based on edge proximity
                vec3 finalColor = mix(warpedColor, mix(gradientStart, gradientEnd, vUV.x), edge);
                
                gl_FragColor = vec4(finalColor, 1.0);
            }
        `
    }, {
        attributes: ["position", "uv"],
        uniforms: ["worldViewProjection", "time", "gradientStart", "gradientEnd", "noiseFactor"]
    });
    spaceDust.material = spaceDustShader;
    spaceDust.material.setVector3("gradientStart", new BABYLON.Vector3(0.843, 0.6235, 0.1647)); // #d79f2a (orange)
    spaceDust.material.setVector3("gradientEnd", new BABYLON.Vector3(0.827, 0.2745, 0.4588));   // #d34675 (pink)
    spaceDust.material.setFloat("noiseFactor", 0.5);
}

// ===== SUNS =====
function createSun(name, scene, position, scale) {
    const sun = BABYLON.MeshBuilder.CreateSphere(name, { segments: 32, diameter: 50 }, scene);
    sun.position = position;
    sun.scaling = new BABYLON.Vector3(scale, scale, scale);
    
    const sunShader = new BABYLON.ShaderMaterial(name + "Shader", scene, {
        vertexSource: `
            precision highp float;
            attribute vec3 position;
            attribute vec3 normal;
            uniform mat4 worldViewProjection;
            varying vec3 vPosition;
            varying vec3 vNormal;
            void main(void) {
                vPosition = position;
                vNormal = normalize(normal);
                gl_Position = worldViewProjection * vec4(position, 1.0);
            }
        `,
        fragmentSource: `
            precision highp float;
            uniform float time;
            uniform vec3 accretionColor1;
            uniform vec3 accretionColor2;
            uniform float innerThreshold;
            uniform float outerThreshold;
            uniform float noiseIntensity;
            uniform float swirlSpeed;
            varying vec3 vPosition;
            varying vec3 vNormal;
            
            void main(void) {
                float r = length(vPosition);
                // Compute normalized radial factor for the accretion disk:
                float disk = smoothstep(innerThreshold, outerThreshold, r);
                
                // Compute swirling noise for a turbulent accretion effect:
                float swirl = sin(time * swirlSpeed + r * 10.0 + dot(vPosition, vNormal)) * noiseIntensity;
                
                vec3 accretion = mix(accretionColor1, accretionColor2, (swirl + 1.0) * 0.5);
                
                // Final color: black at the center moving to the accretion color on the disk
                vec3 finalColor = mix(vec3(0.0), accretion, disk);
                
                gl_FragColor = vec4(finalColor, 1.0);
            }
        `
    }, {
        attributes: ["position", "normal"],
        uniforms: ["worldViewProjection", "time", "accretionColor1", "accretionColor2", "innerThreshold", "outerThreshold", "noiseIntensity", "swirlSpeed"]
    });
    
    sun.material = sunShader;
    sun.material.setVector3("accretionColor1", new BABYLON.Vector3(0.843, 0.6235, 0.1647)); // Orange accretion color (#d79f2a)
    sun.material.setVector3("accretionColor2", new BABYLON.Vector3(0.827, 0.2745, 0.4588)); // Purple accretion color (#d34675)
    sun.material.setFloat("innerThreshold", 10.0);
    sun.material.setFloat("outerThreshold", 15.0);
    sun.material.setFloat("noiseIntensity", 0.5);
    sun.material.setFloat("swirlSpeed", 3.0);
    
    return sun;
}

const sun1 = createSun("sun1", scene, new BABYLON.Vector3(0, 100, -300), 1);

// ===== GALAXIES =====
function createGalaxy(name, scene, position, rotation, scale) {
    const galaxy = BABYLON.MeshBuilder.CreateDisc(name, { radius: 50, tessellation: 64 }, scene);
    galaxy.position = position;
    galaxy.rotation = rotation;
    galaxy.scaling = new BABYLON.Vector3(scale, scale, scale);
    const galaxyShader = new BABYLON.ShaderMaterial(name + "Shader", scene, {
        vertexSource: `
            precision highp float;
            attribute vec3 position;
            attribute vec2 uv;
            uniform mat4 worldViewProjection;
            varying vec2 vUV;
            void main(void) {
                vUV = uv;
                gl_Position = worldViewProjection * vec4(position, 1.0);
            }
        `,
        fragmentSource: `
            precision highp float;
            uniform float time;
            varying vec2 vUV;
            void main(void) {
                // Radial gradient with a swirling spiral effect.
                vec2 centeredUV = vUV - 0.5;
                float dist = length(centeredUV);
                float angle = atan(centeredUV.y, centeredUV.x) + time * 0.2;
                float spiral = sin(dist * 20.0 - angle * 5.0);
                float intensity = smoothstep(0.5, 0.0, dist) + spiral * 0.1;
                vec3 galaxyColor = mix(vec3(0.2, 0.0, 0.4), vec3(1.0, 0.8, 1.0), intensity);
                gl_FragColor = vec4(galaxyColor, intensity);
            }
        `
    }, {
        attributes: ["position", "uv"],
        uniforms: ["worldViewProjection", "time"]
    });
    galaxy.material = galaxyShader;
    return galaxy;
}

const galaxy1 = createGalaxy("galaxy1", scene, new BABYLON.Vector3(100, 50, -200), new BABYLON.Vector3(0, 0.5, 0), 1);
const galaxy2 = createGalaxy("galaxy2", scene, new BABYLON.Vector3(-150, -30, 250), new BABYLON.Vector3(0, -0.3, 0), 1);

// ===== PLANET GENERATION =====
const planets = [];
const numPlanets = 10;
const planetRadius = 2;
const minPlanetDistance = 10;
const maxPlanetDistance = 200;

// Initialize simplex noise
const noise3D = createNoise3D(Math.random);

// Function to generate Perlin noise
function perlinNoise(x, y, z, seed) {
    const scaledX = x * 0.1 + seed;
    const scaledY = y * 0.1 + seed;
    const scaledZ = z * 0.1 + seed;

    let total = 0;
    let frequency = 1;
    let amplitude = 1;
    let maxVal = 0;

    for (let i = 0; i < 4; i++) {
        total += noise3D(scaledX * frequency, scaledY * frequency, scaledZ * frequency) * amplitude;
        maxVal += amplitude;
        amplitude *= 0.5;
        frequency *= 2;
    }
    return (total / maxVal + 1) / 2;
}

// Function to generate planet properties
function generatePlanetProperties(seed) {
    const baseColor = new BABYLON.Color3(
        perlinNoise(seed, 10, 20, seed),
        perlinNoise(seed, 30, 40, seed),
        perlinNoise(seed, 50, 60, seed)
    );
    const reflectance = perlinNoise(seed, 70, 80, seed) * 0.8;
    const emission = perlinNoise(seed, 90, 100, seed) * 0.2;
    const atmosphere = perlinNoise(seed, 110, 120, seed) * 0.5;
    const atmosphereColor = new BABYLON.Color3(
        perlinNoise(seed, 130, 140, seed),
        perlinNoise(seed, 150, 160, seed),
        perlinNoise(seed, 170, 180, seed)
    );
    const seaColor = new BABYLON.Color3(
        perlinNoise(seed, 190, 200, seed),
        perlinNoise(seed, 210, 220, seed),
        perlinNoise(seed, 230, 240, seed)
    );
    const landPct = perlinNoise(seed, 250, 260, seed) * 0.8;

    return {
        baseColor,
        reflectance,
        emission,
        atmosphere,
        atmosphereColor,
        seaColor,
        landPct,
        seed
    };
}

// Function to create a planet with a unique shader
function createPlanet(index, properties) {
    const planet = BABYLON.MeshBuilder.CreateSphere(`planet${index}`, { diameter: planetRadius, segments: 32 }, scene);
    
    // Random position
    const angle = Math.random() * Math.PI * 2;
    const distance = minPlanetDistance + Math.random() * (maxPlanetDistance - minPlanetDistance);
    planet.position = new BABYLON.Vector3(Math.cos(angle) * distance, Math.sin(angle) * distance, (Math.random() - 0.5) * 100);

    // Custom shader for procedural planets with planet-specific variation.
    const planetShader = new BABYLON.ShaderMaterial(`planetShader${index}`, scene, {
        vertexSource: `
            precision highp float;
            attribute vec3 position;
            uniform mat4 worldViewProjection;
            varying vec3 vPosition;
            void main(void) {
                vPosition = position;
                gl_Position = worldViewProjection * vec4(position, 1.0);
            }
        `,
        fragmentSource: `
            precision highp float;
            uniform float time;
            uniform vec3 baseColor;
            uniform float reflectance;
            uniform float emission;
            uniform float atmosphere;
            uniform vec3 atmosphereColor;
            uniform vec3 seaColor;
            uniform float landPct;
            uniform float seed;
            varying vec3 vPosition;
            
            // Simplex noise helper functions
            vec3 mod289_vec3(vec3 x) {
                return x - floor(x * (1.0 / 289.0)) * 289.0;
            }
            float permute(float x) {
                return mod289_vec3(vec3(((x * 34.0) + 1.0) * x)).x;
            }
            float taylorInvSqrt(float r) {
                return 1.79284291400159 - 0.85373472095314 * r;
            }
            float snoise(vec3 v) {
                const vec2 C = vec2(1.0/6.0, 1.0/3.0);
                vec3 i  = floor(v + dot(v, vec3(C.y)));
                vec3 x0 = v - i + dot(i, vec3(C.x));
                vec3 g;
                g = step(x0.yzx, x0.xyz);
                vec3 l = 1.0 - g;
                vec3 i1 = min(g.xyz, l.zxy);
                vec3 i2 = max(g.xyz, l.zxy);
                vec3 x1 = x0 - i1 + vec3(C.x);
                vec3 x2 = x0 - i2 + 2.0 * vec3(C.x);
                vec3 x3 = x0 - 1.0 + 3.0 * vec3(C.x);
                i = mod289_vec3(i);
                float n_ = 0.142857142857;
                vec4 ns = n_ * vec4(1.0);
                vec4 j = vec4(0.0);
                vec4 x_ = vec4(x0.x, x1.x, x2.x, x3.x);
                vec4 y_ = vec4(x0.y, x1.y, x2.y, x3.y);
                vec4 z_ = vec4(x0.z, x1.z, x2.z, x3.z);
                vec4 t = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
                t = t * t;
                return 42.0 * dot(t, vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)));
            }
            
            float perlinNoise(vec3 p, float seed) {
                vec3 scaledP = p * 0.1 + vec3(seed);
                float total = 0.0;
                float frequency = 1.0;
                float amplitude = 1.0;
                float maxVal = 0.0;
                for (int i = 0; i < 4; i++) {
                    total += snoise(scaledP * frequency) * amplitude;
                    maxVal += amplitude;
                    amplitude *= 0.5;
                    frequency *= 2.0;
                }
                return (total / maxVal + 1.0) / 2.0;
            }
            
            void main(void) {
                vec3 normal = normalize(vPosition);
                vec3 noiseCoord = vPosition * 0.1 + vec3(time * 0.3, seed, time * 0.2);
                float noiseValue = perlinNoise(noiseCoord, seed);
                float landValue = smoothstep(landPct - 0.1, landPct + 0.1, noiseValue);
                vec3 colorMix = mix(seaColor, baseColor, landValue);
                
                // Sinusoidal stripe effect for a more interesting surface.
                float stripe = sin(vPosition.y * 10.0 + time) * 0.5 + 0.5;
                vec3 finalColor = mix(colorMix, colorMix * stripe, 0.2);
                
                float glow = sin(time + vPosition.x * 0.1) * 0.5 + 0.5;
                finalColor += emission * glow;
                
                float atmosphereGlow = smoothstep(0.9, 1.0, dot(normal, vec3(0.0, 0.0, 1.0)));
                finalColor = mix(finalColor, atmosphereColor, atmosphere * atmosphereGlow);
                
                gl_FragColor = vec4(finalColor, 1.0);
            }
        `,
    }, {
        attributes: ["position"],
        uniforms: ["worldViewProjection", "time", "baseColor", "reflectance", "emission", "atmosphere", "atmosphereColor", "seaColor", "landPct", "seed"],
    });

    planet.material = planetShader;
    planet.material.setFloat("seed", properties.seed);
    planet.material.setColor3("baseColor", properties.baseColor);
    planet.material.setFloat("reflectance", properties.reflectance);
    planet.material.setFloat("emission", properties.emission);
    planet.material.setFloat("atmosphere", properties.atmosphere);
    planet.material.setColor3("atmosphereColor", properties.atmosphereColor);
    planet.material.setColor3("seaColor", properties.seaColor);
    planet.material.setFloat("landPct", properties.landPct);

    // Clickable planets
    planet.actionManager = new BABYLON.ActionManager(scene);
    planet.actionManager.registerAction(
        new BABYLON.ExecuteCodeAction(
            BABYLON.ActionManager.OnPickTrigger,
            function (evt) {
                const pickedPlanet = evt.meshUnderPointer;
                const ui = document.getElementById("ui");
                const charactersDiv = document.getElementById("characters");

                if (ui && charactersDiv) {
                    ui.style.display = "block";
                    charactersDiv.innerHTML = `Planet ${pickedPlanet.name} selected`;
                }
            }
        )
    );

    return planet;
}

// Generate planets and their moons
for (let i = 0; i < numPlanets; i++) {
    const seed = Math.random() * 1000;
    const properties = generatePlanetProperties(seed);
    const planet = createPlanet(i, properties);
    planets.push(planet);

    // Generate moons for some planets
    if (i % 10 === 0) {
        const numMoons = Math.floor(Math.random() * 3) + 1;
        for (let j = 0; j < numMoons; j++) {
            const moonRadius = planetRadius * 0.3;
            const moon = BABYLON.MeshBuilder.CreateSphere(`moon${i}-${j}`, { diameter: moonRadius, segments: 16 }, scene);
            const moonDistance = planetRadius * 2 + Math.random() * 3;
            const moonAngle = Math.random() * Math.PI * 2;
            moon.position = planet.position.add(new BABYLON.Vector3(Math.cos(moonAngle) * moonDistance, Math.sin(moonAngle) * moonDistance, 0));
            
            const moonProperties = generatePlanetProperties(seed + j * 10);
            const moonShader = new BABYLON.ShaderMaterial(`moonShader${i}-${j}`, scene, {
                vertexSource: `
                    precision highp float;
                    attribute vec3 position;
                    uniform mat4 worldViewProjection;
                    varying vec3 vPosition;
                    void main(void) {
                        vPosition = position;
                        gl_Position = worldViewProjection * vec4(position, 1.0);
                    }
                `,
                fragmentSource: `
                    precision highp float;
                    uniform float time;
                    uniform vec3 baseColor;
                    uniform float reflectance;
                    uniform float emission;
                    uniform float atmosphere;
                    uniform vec3 atmosphereColor;
                    uniform vec3 seaColor;
                    uniform float landPct;
                    uniform float seed;
                    varying vec3 vPosition;
                    
                    vec3 mod289_vec3(vec3 x) {
                        return x - floor(x * (1.0 / 289.0)) * 289.0;
                    }
                    float permute(float x) {
                        return mod289_vec3(vec3(((x * 34.0) + 1.0) * x)).x;
                    }
                    float taylorInvSqrt(float r) {
                        return 1.79284291400159 - 0.85373472095314 * r;
                    }
                    float snoise(vec3 v) {
                        const vec2 C = vec2(1.0/6.0, 1.0/3.0);
                        vec3 i  = floor(v + dot(v, vec3(C.y)));
                        vec3 x0 = v - i + dot(i, vec3(C.x));
                        vec3 g;
                        g = step(x0.yzx, x0.xyz);
                        vec3 l = 1.0 - g;
                        vec3 i1 = min(g.xyz, l.zxy);
                        vec3 i2 = max(g.xyz, l.zxy);
                        vec3 x1 = x0 - i1 + vec3(C.x);
                        vec3 x2 = x0 - i2 + 2.0 * vec3(C.x);
                        vec3 x3 = x0 - 1.0 + 3.0 * vec3(C.x);
                        i = mod289_vec3(i);
                        float n_ = 0.142857142857;
                        vec4 ns = n_ * vec4(1.0);
                        vec4 j = vec4(0.0);
                        vec4 x_ = vec4(x0.x, x1.x, x2.x, x3.x);
                        vec4 y_ = vec4(x0.y, x1.y, x2.y, x3.y);
                        vec4 z_ = vec4(x0.z, x1.z, x2.z, x3.z);
                        vec4 t = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
                        t = t * t;
                        return 42.0 * dot(t, vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)));
                    }
                    
                    float perlinNoise(vec3 p, float seed) {
                        vec3 scaledP = p * 0.1 + vec3(seed);
                        float total = 0.0;
                        float frequency = 1.0;
                        float amplitude = 1.0;
                        float maxVal = 0.0;
                        for (int i = 0; i < 4; i++) {
                            total += snoise(scaledP * frequency) * amplitude;
                            maxVal += amplitude;
                            amplitude *= 0.5;
                            frequency *= 2.0;
                        }
                        return (total / maxVal + 1.0) / 2.0;
                    }
                    
                    void main(void) {
                        vec3 normal = normalize(vPosition);
                        vec3 noiseCoord = vPosition * 0.1 + vec3(time * 0.3, seed, time * 0.2);
                        float noiseValue = perlinNoise(noiseCoord, seed);
                        float landValue = smoothstep(landPct - 0.1, landPct + 0.1, noiseValue);
                        vec3 colorMix = mix(seaColor, baseColor, landValue);
                        float stripe = sin(vPosition.y * 10.0 + time) * 0.5 + 0.5;
                        vec3 finalColor = mix(colorMix, colorMix * stripe, 0.2);
                        float glow = sin(time + vPosition.x * 0.1) * 0.5 + 0.5;
                        finalColor += emission * glow;
                        float atmosphereGlow = smoothstep(0.9, 1.0, dot(normal, vec3(0.0, 0.0, 1.0)));
                        finalColor = mix(finalColor, atmosphereColor, atmosphere * atmosphereGlow);
                        gl_FragColor = vec4(finalColor, 1.0);
                    }
                `,
            }, {
                attributes: ["position"],
                uniforms: ["worldViewProjection", "time", "baseColor", "reflectance", "emission", "atmosphere", "atmosphereColor", "seaColor", "landPct", "seed"],
            });
            moon.material = moonShader;
            moon.material.setFloat("seed", moonProperties.seed);
            moon.material.setColor3("baseColor", moonProperties.baseColor);
            moon.material.setFloat("reflectance", moonProperties.reflectance);
            moon.material.setFloat("emission", moonProperties.emission);
            moon.material.setFloat("atmosphere", moonProperties.atmosphere);
            moon.material.setColor3("atmosphereColor", moonProperties.atmosphereColor);
            moon.material.setColor3("seaColor", moonProperties.seaColor);
            moon.material.setFloat("landPct", moonProperties.landPct);
            planets.push(moon);
        }
    }
}

// ===== OPTIMIZED RENDERING =====
let time = 0;
scene.registerBeforeRender(() => {
    time += 0.01;
    // Update time for all procedural shaders and slowly rotate the planets.
    planets.forEach((planet) => {
        planet.material.setFloat("time", time);
        planet.rotation.y += 0.0002;
    });
    spaceDust.material.setFloat("time", time);
    galaxy1.material.setFloat("time", time);
    galaxy2.material.setFloat("time", time);
    sun1.material.setFloat("time", time);
});

// Add post-processing effects with optimized settings
const pipeline = new BABYLON.DefaultRenderingPipeline("pipeline", true, scene, [camera]);
pipeline.bloomEnabled = true;
pipeline.bloomThreshold = 0.3;
pipeline.bloomWeight = 0.7;
pipeline.bloomKernel = 32; // Reduced for better performance
pipeline.bloomScale = 0.5;

// Add camera inertia for smooth movement
camera.inertia = 0.9;
camera.angularSensibilityX = 500;
camera.angularSensibilityY = 500;

// Optimized render loop
engine.runRenderLoop(() => {
    scene.render();
});

// Handle window resize
window.addEventListener("resize", () => {
    engine.resize();
});
