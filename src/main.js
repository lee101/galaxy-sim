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
    
    // Random white-blue colors
    const brightness = 0.5 + Math.random() * 0.5;
    starColors[colorIdx] = brightness;
    starColors[colorIdx + 1] = brightness;
    starColors[colorIdx + 2] = brightness + Math.random() * 0.3;
    starColors[colorIdx + 3] = Math.random() * 0.5 + 0.5;
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
    // Optional: Add some rotation to the star field
    scene.registerBeforeRender(() => {
        starSystem.mesh.rotation.y += 0.0001;
    });
});

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

// Function to create a planet
function createPlanet(index, properties) {
    const planet = BABYLON.MeshBuilder.CreateSphere(`planet${index}`, { diameter: planetRadius, segments: 32 }, scene);
    
    // Random position
    const angle = Math.random() * Math.PI * 2;
    const distance = minPlanetDistance + Math.random() * (maxPlanetDistance - minPlanetDistance);
    planet.position = new BABYLON.Vector3(Math.cos(angle) * distance, Math.sin(angle) * distance, (Math.random() - 0.5) * 100);

    // Custom shader for procedural planets
    const planetShader = new BABYLON.ShaderMaterial("planetShader", scene, {
        vertexSource: `
            precision highp float;
            attribute vec3 position;
            uniform mat4 worldViewProjection;
            void main(void) {
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
            
            // Simplex noise functions (GLSL)
            vec3 mod289_vec3(vec3 x) {
                return x - floor(x * (1.0 / 289.0)) * 289.0;
            }
            vec4 mod289_vec4(vec4 x) {
                return x - floor(x * (1.0 / 289.0)) * 289.0;
            }
            float permute(float x) {
                return mod289_vec3(vec3(((x*34.0)+1.0)*x)).x;
            }
            float taylorInvSqrt(float r) {
                return 1.79284291400159 - 0.85373472095314 * r;
            }
            float snoise(vec3 v) {
                const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
                const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
                // First corner
                vec3 i  = floor(v + dot(v, C.yyy) );
                vec3 x0 =   v - i + dot(i, C.xxx) ;
                // Other corners
                vec3 i1;
                i1 = (x0.x > x0.y) ? (x0.x > x0.z ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 0.0, 1.0)) : (x0.y > x0.z ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.0, 1.0));
                vec3 i2 = vec3(1.0, 1.0, 1.0) - i1;
                //   x0 = x0 - 0.0 + 0.0 * C.xxx;
                vec3 x1 = x0 - i1 + 1.0 * C.xxx;
                vec3 x2 = x0 - i2 + 2.0 * C.xxx;
                vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
                // Permutations
                i = mod289_vec3(i);
                float i_x = permute(permute(i.z) + i.y);
                float i_xy = permute(i_x + i.x);
                float i_xz = permute(i_x + i.z);
                float i_yz = permute(permute(i.x) + i.y);
                float i_xyz = permute(i_yz + i.z);
                float i_zy = permute(permute(i.x) + i.z);
                float i_zyx = permute(i_zy + i.y);
                vec4 x = vec4(x0.x, x1.x, x2.x, x3.x);
                vec4 y = vec4(x0.y, x1.y, x2.y, x3.y);
                vec4 z = vec4(x0.z, x1.z, x2.z, x3.z);
                vec4 ii = vec4(i_xy, i_xz, i_yz, i_xyz);
                vec4 j = vec4(i_zyx, i_zy, i_x, i.y);
                vec4 g0 = vec4(permute(ii.x + j.x), permute(ii.y + j.y), permute(ii.z + j.z), permute(ii.w + j.w));
                vec4 g1 = vec4(permute(g0.x + j.x), permute(g0.y + j.y), permute(g0.z + j.z), permute(g0.w + j.w));
                vec4 g2 = vec4(permute(g1.x + j.x), permute(g1.y + j.y), permute(g1.z + j.z), permute(g1.w + j.w));
                vec4 g3 = vec4(permute(g2.x + j.x), permute(g2.y + j.y), permute(g2.z + j.z), permute(g2.w + j.w));
                vec4 g = vec4(g0.x, g1.x, g2.x, g3.x);
                vec4 n = vec4(0.0, 0.0, 0.0, 0.0);
                vec3  m = max(0.6 - vec3(dot(x0,x0), dot(x1,x1), dot(x2,x2)), 0.0);
                n.x = m.x * m.x * dot(g, vec4(x0.x, x0.y, x0.z, 0.0));
                m = max(0.6 - vec3(dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
                n.y = m.x * m.x * dot(g, vec4(x1.x, x1.y, x1.z, 0.0));
                n.z = m.y * m.y * dot(g, vec4(x2.x, x2.y, x2.z, 0.0));
                n.w = m.z * m.z * dot(g, vec4(x3.x, x3.y, x3.z, 0.0));
                return 70.0 * (n.x + n.y + n.z + n.w);
            }

            float perlinNoise(vec3 p, float seed) {
                float scaledX = p.x * 0.1 + seed;
                float scaledY = p.y * 0.1 + seed;
                float scaledZ = p.z * 0.1 + seed;
                
                float total = 0.0;
                float frequency = 1.0;
                float amplitude = 1.0;
                float maxVal = 0.0;
                
                for (int i = 0; i < 4; i++) {
                    total += snoise(vec3(scaledX * frequency, scaledY * frequency, scaledZ * frequency)) * amplitude;
                    maxVal += amplitude;
                    amplitude *= 0.5;
                    frequency *= 2.0;
                }
                return (total / maxVal + 1.0) / 2.0;
            }

            void main(void) {
                vec3 normal = normalize(gl_FragCoord.xyz - vec3(400.0, 300.0, 0.0));
                float noiseValue = perlinNoise(gl_FragCoord.xyz * 0.01, seed);
                float landValue = smoothstep(landPct - 0.1, landPct + 0.1, noiseValue);
                vec3 finalColor = mix(seaColor, baseColor, landValue);
                
                float glow = sin(time + gl_FragCoord.x * 0.01) * 0.5 + 0.5;
                finalColor += vec3(emission * glow);
                
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

// Generate planets
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
            const moon = BABYLON.MeshBuilder.CreateSphere(`moon${i}-${j}`, { diameter: moonRadius }, scene);
            const moonDistance = planetRadius * 2 + Math.random() * 3;
            const moonAngle = Math.random() * Math.PI * 2;
            moon.position = planet.position.add(new BABYLON.Vector3(Math.cos(moonAngle) * moonDistance, Math.sin(moonAngle) * moonDistance, 0));
            
            const moonProperties = generatePlanetProperties(seed + j * 10);
            const moonShader = new BABYLON.ShaderMaterial("moonShader", scene, {
                vertexSource: `
                    precision highp float;
                    attribute vec3 position;
                    uniform mat4 worldViewProjection;
                    void main(void) {
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
                    
                    // Simplex noise functions (GLSL)
                    vec3 mod289_vec3(vec3 x) {
                        return x - floor(x * (1.0 / 289.0)) * 289.0;
                    }
                    vec4 mod289_vec4(vec4 x) {
                        return x - floor(x * (1.0 / 289.0)) * 289.0;
                    }
                    float permute(float x) {
                        return mod289_vec3(vec3(((x*34.0)+1.0)*x)).x;
                    }
                    float taylorInvSqrt(float r) {
                        return 1.79284291400159 - 0.85373472095314 * r;
                    }
                    float snoise(vec3 v) {
                        const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
                        const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
                        // First corner
                        vec3 i  = floor(v + dot(v, C.yyy) );
                        vec3 x0 =   v - i + dot(i, C.xxx) ;
                        // Other corners
                        vec3 i1;
                        i1 = (x0.x > x0.y) ? (x0.x > x0.z ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 0.0, 1.0)) : (x0.y > x0.z ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.0, 1.0));
                        vec3 i2 = vec3(1.0, 1.0, 1.0) - i1;
                        //   x0 = x0 - 0.0 + 0.0 * C.xxx;
                        vec3 x1 = x0 - i1 + 1.0 * C.xxx;
                        vec3 x2 = x0 - i2 + 2.0 * C.xxx;
                        vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
                        // Permutations
                        i = mod289_vec3(i);
                        float i_x = permute(permute(i.z) + i.y);
                        float i_xy = permute(i_x + i.x);
                        float i_xz = permute(i_x + i.z);
                        float i_yz = permute(permute(i.x) + i.y);
                        float i_xyz = permute(i_yz + i.z);
                        float i_zy = permute(permute(i.x) + i.z);
                        float i_zyx = permute(i_zy + i.y);
                        vec4 x = vec4(x0.x, x1.x, x2.x, x3.x);
                        vec4 y = vec4(x0.y, x1.y, x2.y, x3.y);
                        vec4 z = vec4(x0.z, x1.z, x2.z, x3.z);
                        vec4 ii = vec4(i_xy, i_xz, i_yz, i_xyz);
                        vec4 j = vec4(i_zyx, i_zy, i_x, i.y);
                        vec4 g0 = vec4(permute(ii.x + j.x), permute(ii.y + j.y), permute(ii.z + j.z), permute(ii.w + j.w));
                        vec4 g1 = vec4(permute(g0.x + j.x), permute(g0.y + j.y), permute(g0.z + j.z), permute(g0.w + j.w));
                        vec4 g2 = vec4(permute(g1.x + j.x), permute(g1.y + j.y), permute(g1.z + j.z), permute(g1.w + j.w));
                        vec4 g3 = vec4(permute(g2.x + j.x), permute(g2.y + j.y), permute(g2.z + j.z), permute(g2.w + j.w));
                        vec4 g = vec4(g0.x, g1.x, g2.x, g3.x);
                        vec4 n = vec4(0.0, 0.0, 0.0, 0.0);
                        vec3  m = max(0.6 - vec3(dot(x0,x0), dot(x1,x1), dot(x2,x2)), 0.0);
                        n.x = m.x * m.x * dot(g, vec4(x0.x, x0.y, x0.z, 0.0));
                        m = max(0.6 - vec3(dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
                        n.y = m.x * m.x * dot(g, vec4(x1.x, x1.y, x1.z, 0.0));
                        n.z = m.y * m.y * dot(g, vec4(x2.x, x2.y, x2.z, 0.0));
                        n.w = m.z * m.z * dot(g, vec4(x3.x, x3.y, x3.z, 0.0));
                        return 70.0 * (n.x + n.y + n.z + n.w);
                    }

                    float perlinNoise(vec3 p, float seed) {
                        float scaledX = p.x * 0.1 + seed;
                        float scaledY = p.y * 0.1 + seed;
                        float scaledZ = p.z * 0.1 + seed;
                        
                        float total = 0.0;
                        float frequency = 1.0;
                        float amplitude = 1.0;
                        float maxVal = 0.0;
                        
                        for (int i = 0; i < 4; i++) {
                            total += snoise(vec3(scaledX * frequency, scaledY * frequency, scaledZ * frequency)) * amplitude;
                            maxVal += amplitude;
                            amplitude *= 0.5;
                            frequency *= 2.0;
                        }
                        return (total / maxVal + 1.0) / 2.0;
                    }

                    void main(void) {
                        vec3 normal = normalize(gl_FragCoord.xyz - vec3(400.0, 300.0, 0.0));
                        float noiseValue = perlinNoise(gl_FragCoord.xyz * 0.01, seed);
                        float landValue = smoothstep(landPct - 0.1, landPct + 0.1, noiseValue);
                        vec3 finalColor = mix(seaColor, baseColor, landValue);
                        
                        float glow = sin(time + gl_FragCoord.x * 0.01) * 0.5 + 0.5;
                        finalColor += vec3(emission * glow);
                        
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
    planets.forEach((planet) => {
        planet.material.setFloat("time", time);
        planet.rotation.y += 0.0002;
    });
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
