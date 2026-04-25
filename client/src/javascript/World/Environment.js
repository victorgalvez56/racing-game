import * as THREE from 'three'
import MatcapMaterial from '../Materials/Matcap.js'

// Same shading uniforms used by the track walls — keeps visual consistency
const SHADE = {
    uRevealProgress:            1,
    uIndirectDistanceAmplitude: 1.75,
    uIndirectDistanceStrength:  0.5,
    uIndirectDistancePower:     2.0,
    uIndirectAngleStrength:     1.5,
    uIndirectAngleOffset:       0.6,
    uIndirectAnglePower:        1.0,
    uIndirectColor:             new THREE.Color('#d04500'),
}

export default class Environment
{
    constructor(_options)
    {
        this.resources = _options.resources
        this.renderer  = _options.renderer

        this.container = new THREE.Object3D()
        this.container.matrixAutoUpdate = false

        this._cache = {}    // material cache

        this._buildSky()
        this._buildGantry()
        this._buildTrees()
        this._buildStands()
        this._buildGravelTraps()

        // Atmospheric dark-blue background instead of pure black
        this.renderer.setClearColor(0x080c12, 1)
    }

    // ── Material helpers ─────────────────────────────────────────────────────

    _mat(key)
    {
        if(this._cache[key]) return this._cache[key]
        const m = MatcapMaterial()
        m.uniforms.matcap.value = this.resources.items[key]
            ?? this.resources.items.matcapWhiteTexture
        for(const [k, v] of Object.entries(SHADE)) m.uniforms[k].value = v
        this._cache[key] = m
        return m
    }

    // Adds a mesh with optional rotation. rx/ry/rz in radians.
    _place(geo, mat, x, y, z, rx = 0, ry = 0, rz = 0)
    {
        const m = new THREE.Mesh(geo, mat)
        m.position.set(x, y, z)
        m.rotation.set(rx, ry, rz)
        m.matrixAutoUpdate = false
        m.updateMatrix()
        this.container.add(m)
        return m
    }

    // Vertical cylinder (along Z axis in a Z-up scene).
    // h  = total height, center placed at z = zBase + h/2
    _vcyl(r1, r2, h, segs, mat, x, y, zBase)
    {
        return this._place(
            new THREE.CylinderGeometry(r1, r2, h, segs),
            mat, x, y, zBase + h / 2,
            Math.PI / 2   // rotate Y-axis cylinder to align with Z
        )
    }

    // Vertical cone (apex at top). h = height, center at zBase + h/2
    _vcone(r, h, segs, mat, x, y, zBase)
    {
        return this._place(
            new THREE.ConeGeometry(r, h, segs),
            mat, x, y, zBase + h / 2,
            Math.PI / 2
        )
    }

    // ── Sky dome ─────────────────────────────────────────────────────────────

    _buildSky()
    {
        const geo = new THREE.SphereGeometry(480, 24, 12)
        const pos = geo.attributes.position
        const col = []

        for(let i = 0; i < pos.count; i++)
        {
            const t = THREE.MathUtils.clamp((pos.getZ(i) + 80) / 180, 0, 1)
            // Horizon: dark teal-blue  /  Zenith: near-black
            col.push(
                THREE.MathUtils.lerp(0.055, 0.01, t),
                THREE.MathUtils.lerp(0.09,  0.02, t),
                THREE.MathUtils.lerp(0.20,  0.04, t),
            )
        }
        geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))

        const mesh = new THREE.Mesh(
            geo,
            new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })
        )
        mesh.matrixAutoUpdate = false
        mesh.updateMatrix()
        this.container.add(mesh)
    }

    // ── Start / finish gantry ────────────────────────────────────────────────
    //
    //   Track at start: centerline (5, -35), walls at y ≈ -28 (north) and y ≈ -42 (south)
    //   Gantry sits just past the line at x = 6, posts outside the walls.

    _buildGantry()
    {
        const GX   =   6      // x position — just past the start/finish line
        const GY_S = -46      // south post (beyond the south wall at y ≈ -42)
        const GY_N = -24      // north post (beyond the north wall at y ≈ -28)
        const GH   =   9      // post height (meters)
        const SPAN = GY_N - GY_S   // 22 m

        const matGray  = this._mat('matcapGrayTexture')
        const matMetal = this._mat('matcapMetalTexture')
        const matWhite = this._mat('matcapWhiteTexture')

        // ── Two vertical posts ──
        this._vcyl(0.30, 0.40, GH, 10, matGray, GX, GY_S, 0)
        this._vcyl(0.30, 0.40, GH, 10, matGray, GX, GY_N, 0)

        // ── Horizontal beam along Y at top ──
        this._place(
            new THREE.BoxGeometry(0.55, SPAN + 2, 0.6),
            matGray,
            GX, (GY_S + GY_N) / 2, GH
        )

        // ── Four signal lights evenly spaced on the beam ──
        const lightGeo = new THREE.SphereGeometry(0.32, 10, 8)
        const step = (SPAN - 4) / 3
        for(let i = 0; i < 4; i++)
        {
            const ly = GY_S + 2 + step * i
            this._place(lightGeo, matWhite, GX, ly, GH + 0.48)
        }

        // ── Diagonal braces: one per side, from post top to beam ──
        const BRACE_REACH = 4     // how far along beam the brace attaches
        const braceLen = Math.sqrt(BRACE_REACH ** 2 + GH ** 2 * 0.1)
        const braceGeo = new THREE.CylinderGeometry(0.12, 0.12, braceLen, 6)

        ;[
            { y: GY_S, dir: +1 },
            { y: GY_N, dir: -1 },
        ].forEach(({ y, dir }) =>
        {
            const brace = new THREE.Mesh(braceGeo, matMetal)
            // Midpoint between post top and attachment point on beam
            brace.position.set(GX, y + dir * BRACE_REACH / 2, GH * 0.95)
            // Tilt: rotate around X to angle toward attachment
            brace.rotation.x = Math.PI / 2
            brace.rotation.z = Math.atan2(BRACE_REACH * dir, 0.5) * 0.4
            brace.matrixAutoUpdate = false
            brace.updateMatrix()
            this.container.add(brace)
        })

        // ── "FINISH" text plaque on the beam ── (just a flat rectangle)
        this._place(
            new THREE.BoxGeometry(0.15, 6, 0.8),
            this._mat('matcapBlueTexture'),
            GX + 0.35, (GY_S + GY_N) / 2, GH + 0.1
        )
    }

    // ── Tree clusters ────────────────────────────────────────────────────────

    _buildTrees()
    {
        const matGreen = this._mat('matcapEmeraldGreenTexture')
        const matBrown = this._mat('matcapBrownTexture')

        // Each cluster is an { x, y } anchor + count of trees.
        // Positions chosen to be clearly outside the track outer walls.
        const clusters = [
            { x: -52, y: -22, n: 3 },   // far left, lower
            { x: -55, y:  15, n: 2 },   // far left, middle
            { x:  -8, y: -58, n: 4 },   // below start straight
            { x:  58, y: -40, n: 2 },   // lower-right corner
            { x:  70, y:   8, n: 3 },   // right hairpin exterior
            { x:  40, y:  52, n: 3 },   // upper right
            { x:  -5, y:  55, n: 2 },   // upper centre
            { x: -42, y:  44, n: 3 },   // upper left
        ]

        clusters.forEach(({ x, y, n }) =>
        {
            for(let i = 0; i < n; i++)
            {
                const ox = x + (Math.random() - 0.5) * 12
                const oy = y + (Math.random() - 0.5) * 12
                this._tree(ox, oy, matGreen, matBrown)
            }
        })
    }

    _tree(x, y, matGreen, matBrown)
    {
        const s = 0.8 + Math.random() * 0.55   // random scale

        // Trunk
        const trunkH = 1.4 * s
        this._vcyl(0.22 * s, 0.32 * s, trunkH, 7, matBrown, x, y, 0)

        // Three foliage tiers — largest at bottom, smallest at top
        const tiers = [
            { r: 2.6 * s, h: 3.2 * s, base: trunkH + 0.2 * s },
            { r: 1.8 * s, h: 2.6 * s, base: trunkH + 2.6 * s },
            { r: 1.0 * s, h: 2.0 * s, base: trunkH + 4.7 * s },
        ]
        tiers.forEach(({ r, h, base }) =>
        {
            this._vcone(r, h, 7, matGreen, x, y, base)
        })
    }

    // ── Gravel traps (visual only — drag is handled by World off-track detection) ──

    _buildGravelTraps()
    {
        const mat = new THREE.MeshBasicMaterial({
            color:      0x6e5c3a,
            transparent: true,
            opacity:    0.72,
            depthWrite: false,
            side:       THREE.DoubleSide,
        })

        // Outside the right lower hairpin (track curves from +X to +Y around x≈58,y≈-22)
        this._place(new THREE.PlaneGeometry(22, 16), mat,  70, -16, 0.02, 0, 0, 0.3)

        // Outside the right upper section (track curves NW around x≈58,y≈5)
        this._place(new THREE.PlaneGeometry(16, 14), mat,  68,  30, 0.02, 0, 0, 0.7)

        // Outside the left side (track turns S around x≈-42,y≈-5)
        this._place(new THREE.PlaneGeometry(14, 22), mat, -54,   5, 0.02)

        // Outside the upper-left hairpin (track curves SE around x≈-38,y≈-25)
        this._place(new THREE.PlaneGeometry(16, 14), mat, -50, -30, 0.02, 0, 0, -0.4)
    }

    // ── Grandstands ──────────────────────────────────────────────────────────

    _buildStands()
    {
        const matGray  = this._mat('matcapGrayTexture')
        const matBeige = this._mat('matcapBeigeTexture')

        // Stand 1 — south of the start/finish straight, facing north toward track
        // Track south wall at y ≈ -42, stand placed at y ≈ -55
        this._stand(18, -56, 40, 7, 6.5, matGray, matBeige, 0)

        // Stand 2 — east of the right-side hairpin
        // Track east wall at x ≈ 65, stand placed at x ≈ 76
        this._stand(76, 2, 30, 7, 5.5, matGray, matBeige, Math.PI * 0.5)
    }

    _stand(x, y, width, depth, height, matGray, matBeige, angle)
    {
        // Layered stand:  concrete base  →  seating tiers  →  roof awning
        const baseH  = height * 0.35
        const tierH  = height * 0.65
        const awningH = 0.4

        // Concrete base slab
        this._place(
            new THREE.BoxGeometry(width, depth, baseH),
            matGray, x, y, baseH / 2, 0, 0, angle
        )

        // Seating block (slightly recessed from front)
        this._place(
            new THREE.BoxGeometry(width * 0.92, depth * 0.75, tierH),
            matBeige, x, y, baseH + tierH / 2, 0, 0, angle
        )

        // Roof awning (thin flat slab overhanging front)
        this._place(
            new THREE.BoxGeometry(width + 3, depth + 1, awningH),
            matGray, x, y, baseH + tierH + awningH / 2, 0, 0, angle
        )

        // Vertical supports under awning — four pillars
        const pillarH = tierH + awningH
        const spacing = width * 0.8
        ;[-1, -0.33, 0.33, 1].forEach(t =>
        {
            const px = Math.cos(angle) * t * spacing / 2 + x
            const py = Math.sin(angle) * t * spacing / 2 + y
            this._vcyl(0.2, 0.2, pillarH, 6, matGray, px, py, baseH)
        })
    }
}
