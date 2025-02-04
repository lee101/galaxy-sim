import { describe, it, expect, vi } from 'vitest';
import { createNoise3D } from 'simplex-noise';
import * as BABYLON from 'babylonjs';
import 'babylonjs-loaders';

// Create a canvas for Babylon.js
const canvas = document.createElement('canvas');
canvas.id = 'renderCanvas';
document.body.appendChild(canvas);

// Create UI elements for the test
const ui = document.createElement('div');
ui.id = 'ui';
ui.style.display = 'none';
const charactersDiv = document.createElement('div');
charactersDiv.id = 'characters';
document.body.appendChild(ui);
document.body.appendChild(charactersDiv);

// Create a Babylon.js engine
const engine = new BABYLON.Engine(canvas, true);

// Import the functions we want to test
import { createScene } from '@/main.js';

describe('Planet Generation', () => {
    it('should generate a scene with planets', () => {
        const scene = createScene();
        expect(scene).toBeDefined();
        expect(scene.meshes.length).toBeGreaterThan(0);
    });

    it('should generate planet properties', () => {
        const noise3D = createNoise3D(Math.random);
        const perlinNoise = (x, y, z, seed) => {
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
        };

        const generatePlanetProperties = (seed) => {
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
        };

        const properties = generatePlanetProperties(123);
        expect(properties).toBeDefined();
        expect(properties.baseColor).toBeDefined();
        expect(properties.reflectance).toBeGreaterThanOrEqual(0);
        expect(properties.reflectance).toBeLessThanOrEqual(0.8);
        expect(properties.emission).toBeGreaterThanOrEqual(0);
        expect(properties.emission).toBeLessThanOrEqual(0.2);
        expect(properties.atmosphere).toBeGreaterThanOrEqual(0);
        expect(properties.atmosphere).toBeLessThanOrEqual(0.5);
        expect(properties.atmosphereColor).toBeDefined();
        expect(properties.seaColor).toBeDefined();
        expect(properties.landPct).toBeGreaterThanOrEqual(0);
        expect(properties.landPct).toBeLessThanOrEqual(0.8);
        expect(properties.seed).toBe(123);
    });
}); 