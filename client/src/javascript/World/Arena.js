import * as THREE from 'three'
import CANNON from 'cannon'
import MatcapMaterial from '../Materials/Matcap.js'

// ── Layout constants ────────────────────────────────────────────────────────
const SIZE          = 100     // arena footprint (100×100m)
const WALL_HEIGHT   = 2.6
const WALL_THICK    = 1.0
const SURFACE_Z     = 0.012

const PLATEAU_SIZE   = 14
const PLATEAU_HEIGHT = 1.2
const RAMP_THICK     = 0.1

// 4 spawn slots clustered on the south side, away from the plateau
export const ARENA_SPAWN_GRID = [
    { x:  -6, y: -42 },
    { x:   6, y: -42 },
    { x: -18, y: -42 },
    { x:  18, y: -42 },
]

const SHADE_UNIFORMS = {
    uRevealProgress:            1,
    uIndirectDistanceAmplitude: 1.75,
    uIndirectDistanceStrength:  0.5,
    uIndirectDistancePower:     2.0,
    uIndirectAngleStrength:     1.5,
    uIndirectAngleOffset:       0.6,
    uIndirectAnglePower:        1.0,
    uIndirectColor:             new THREE.Color('#d04500'),
}

export default class Arena
{
    constructor(_options)
    {
        this.world      = _options.world
        this.floorMat   = _options.floorMaterial
        this.resources  = _options.resources

        this.container = new THREE.Object3D()
        this.container.matrixAutoUpdate = false

        this._matWall    = this._makeMatcap('matcapWhiteTexture')
        this._matAccent  = this._makeMatcap('matcapRedTexture')
        this._matMetal   = this._makeMatcap('matcapMetalTexture') ?? this._matWall

        this.size       = SIZE
        this.spawnPos   = { x: 0, y: -42 }
        this.centerPath = []

        this._build()
    }

    _makeMatcap(texName)
    {
        const tex = this.resources.items[texName]
        if(!tex) return null
        const mat = MatcapMaterial()
        mat.uniforms.matcap.value = tex
        for(const [k, v] of Object.entries(SHADE_UNIFORMS))
            mat.uniforms[k].value = v
        return mat
    }

    _build()
    {
        this._createPerimeter()
        this._createPlateau()
        this._createPlateauRamps()
        this._createBowl(  28,  28)        // NE quadrant — skate bowl
        this._createStairs(-28,  20)       // NW quadrant — stairs up to high deck
        this._createKicker( 28, -28)       // SE quadrant — big jump ramp
        this._createSpine( -28, -28)       // SW quadrant — spine (back-to-back ramps)
        this._createObstacles()            // Mixed low-poly trees + L cover
        this._createMarkings()
    }

    // ── Perimeter ──────────────────────────────────────────────────────────
    _createPerimeter()
    {
        const half = SIZE / 2
        const t    = WALL_THICK
        const ext  = SIZE + t * 2

        for(const w of [
            { x:  0,           y:  half + t/2, w: ext, h: t   },
            { x:  0,           y: -half - t/2, w: ext, h: t   },
            { x: -half - t/2,  y:  0,          w: t,   h: ext },
            { x:  half + t/2,  y:  0,          w: t,   h: ext },
        ])
            this._addBlock(w.x, w.y, w.w, w.h, WALL_HEIGHT, this._matWall)
    }

    // ── Central plateau + 4 cardinal ramps ─────────────────────────────────
    _createPlateau()
    {
        this._addBlock(0, 0, PLATEAU_SIZE, PLATEAU_SIZE, PLATEAU_HEIGHT, this._matAccent)

        // Decorative gold ring on top of plateau
        const ringGeo = new THREE.RingGeometry(2.0, 2.4, 32)
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xffb627, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
        })
        const ring = new THREE.Mesh(ringGeo, ringMat)
        ring.position.set(0, 0, PLATEAU_HEIGHT + 0.005)
        ring.matrixAutoUpdate = false
        ring.updateMatrix()
        this.container.add(ring)
    }

    _createPlateauRamps()
    {
        const RL = 7, RW = 5
        const offset = PLATEAU_SIZE / 2 + RL / 2

        for(const r of [
            { x:  0,      y: -offset, orient:    0 },
            { x:  0,      y:  offset, orient:  180 },
            { x:  offset, y:  0,      orient:   90 },
            { x: -offset, y:  0,      orient:  -90 },
        ])
            this._addRamp(r.x, r.y, RW, RL, PLATEAU_HEIGHT, r.orient, this._matAccent)
    }

    // ── Skate bowl (pool-style depression with rim) ────────────────────────
    _createBowl(cx, cy)
    {
        const SIZE_B  = 14    // bowl square footprint
        const RIM_PEAK = 0.5  // rim height — low so cars drive over both ways
        const RIM_LEN  = 4
        const RIM_WIDTH = 12

        const offset = SIZE_B / 2 + RIM_LEN / 2

        // 4 inward-facing rims; each ramp's high end touches the bowl boundary,
        // low end at outside — cars drive UP over the rim and DROP into the bowl
        for(const r of [
            { x: cx,         y: cy - offset, orient:    0 },
            { x: cx,         y: cy + offset, orient:  180 },
            { x: cx + offset, y: cy,         orient:   90 },
            { x: cx - offset, y: cy,         orient:  -90 },
        ])
            this._addRamp(r.x, r.y, RIM_WIDTH, RIM_LEN, RIM_PEAK, r.orient, this._matWall)

        // Pool "water" — dark blue disc on the floor
        const poolGeo = new THREE.PlaneGeometry(SIZE_B, SIZE_B)
        const poolMat = new THREE.MeshBasicMaterial({
            color: 0x143042, transparent: true, opacity: 0.85,
        })
        const pool = new THREE.Mesh(poolGeo, poolMat)
        pool.position.set(cx, cy, SURFACE_Z + 0.001)
        pool.matrixAutoUpdate = false
        pool.updateMatrix()
        this.container.add(pool)

        // Surface ripples — concentric rings inside the pool for water feel
        for(const r of [3.0, 4.5, 6.0])
        {
            const ringGeo = new THREE.RingGeometry(r - 0.05, r, 48)
            const ringMat = new THREE.MeshBasicMaterial({
                color: 0x00d8ff, transparent: true, opacity: 0.18, side: THREE.DoubleSide,
            })
            const ring = new THREE.Mesh(ringGeo, ringMat)
            ring.position.set(cx, cy, SURFACE_Z + 0.002)
            ring.matrixAutoUpdate = false
            ring.updateMatrix()
            this.container.add(ring)
        }

        // 4 corner accent posts (octahedrons)
        const half = SIZE_B / 2 + 1.5
        for(const sx of [-1, 1]) for(const sy of [-1, 1])
        {
            this._addOctahedronPost(cx + sx * half, cy + sy * half, 1.4)
        }
    }

    // ── Stairs leading up to a deck platform ───────────────────────────────
    _createStairs(cx, cy)
    {
        // 5 progressively higher steps, then a flat deck at the top
        const STEP_W = 6
        const STEP_D = 2
        const STEP_H = 0.4
        const DECK_H = STEP_H * 5
        const DECK_D = 6

        for(let i = 0; i < 5; i++)
        {
            const h = STEP_H * (i + 1)
            this._addBlock(cx, cy + i * STEP_D, STEP_W, STEP_D, h, this._matWall)
        }
        // Top deck
        this._addBlock(cx, cy + 5 * STEP_D + DECK_D / 2, STEP_W + 2, DECK_D, DECK_H, this._matAccent)
    }

    // ── Big kicker (large jump ramp) ───────────────────────────────────────
    _createKicker(cx, cy)
    {
        // Tall single ramp — peak 2.0m over 9m, perfect for big airtime
        this._addRamp(cx, cy, 7, 9, 2.0, 180, this._matAccent)
        // Landing pad on the high-side flank
        this._addBlock(cx, cy - 8.5, 8, 1.5, 0.4, this._matWall)
    }

    // ── Spine (two ramps back-to-back, jump from either direction) ─────────
    _createSpine(cx, cy)
    {
        // Two ramps mirrored, sharing a high crest in the middle
        this._addRamp(cx, cy - 3, 6, 5, 1.6,    0, this._matWall)
        this._addRamp(cx, cy + 3, 6, 5, 1.6,  180, this._matWall)
        // Crest accent block at the top
        this._addBlock(cx, cy, 6, 0.6, 1.6, this._matAccent)
    }

    // ── Mixed low-poly obstacles (varied tree types + L covers) ────────────
    _createObstacles()
    {
        // Mixed tree shapes — cones (pines), octahedrons (crystals), cylinders (pylons)
        const trees = [
            { x:  18,  y:   8, type: 'cone',     scale: 1.4 },
            { x: -18,  y:   8, type: 'octa',     scale: 1.2 },
            { x:  18,  y:  -8, type: 'cylinder', scale: 1.0 },
            { x: -18,  y:  -8, type: 'cone',     scale: 1.6 },
            { x:   8,  y:  18, type: 'octa',     scale: 1.0 },
            { x:  -8,  y:  18, type: 'cylinder', scale: 1.3 },
            { x:   8,  y: -18, type: 'cone',     scale: 1.0 },
            { x:  -8,  y: -18, type: 'octa',     scale: 1.4 },
            { x:  40,  y:  10, type: 'cone',     scale: 1.2 },
            { x: -40,  y: -10, type: 'cone',     scale: 1.2 },
            { x:  10,  y:  40, type: 'cylinder', scale: 1.5 },
            { x: -10,  y: -40, type: 'cylinder', scale: 1.5 },
        ]
        for(const t of trees)
        {
            if(t.type === 'cone')          this._addCone(t.x, t.y, t.scale)
            else if(t.type === 'octa')     this._addOctahedronPost(t.x, t.y, 1.6 * t.scale)
            else                            this._addCylinderPost(t.x, t.y, 4.0 * t.scale, 0.55 * t.scale)
        }

        // L-shaped crash barriers in 2 mid-arena spots (south)
        const Lcovers = [
            { x:  18, y: -32, w: 6,   h: 1.2, height: 1.8 },
            { x:  21, y: -29, w: 1.2, h: 4,   height: 1.8 },
            { x: -18, y: -32, w: 6,   h: 1.2, height: 1.8 },
            { x: -21, y: -29, w: 1.2, h: 4,   height: 1.8 },
        ]
        for(const c of Lcovers)
            this._addBlock(c.x, c.y, c.w, c.h, c.height, this._matWall)
    }

    // ── Floor markings ─────────────────────────────────────────────────────
    _createMarkings()
    {
        // Hex ring around the central plateau
        const hexGeo = new THREE.RingGeometry(11.5, 12.0, 6)
        const hexMat = new THREE.MeshBasicMaterial({
            color: 0xff2e4d, transparent: true, opacity: 0.32, side: THREE.DoubleSide,
        })
        const hex = new THREE.Mesh(hexGeo, hexMat)
        hex.position.z = SURFACE_Z
        hex.rotation.z = Math.PI / 6
        hex.matrixAutoUpdate = false
        hex.updateMatrix()
        this.container.add(hex)

        // Caution stripes at the corners
        const stripeGeo = new THREE.PlaneGeometry(14, 1.6)
        const stripeMat = new THREE.MeshBasicMaterial({
            color: 0xffb627, transparent: true, opacity: 0.18,
        })
        const corner = SIZE / 2 - 6
        for(const sx of [-1, 1]) for(const sy of [-1, 1])
        {
            const stripe = new THREE.Mesh(stripeGeo, stripeMat)
            stripe.position.set(sx * corner, sy * corner, SURFACE_Z)
            stripe.rotation.z = sx * sy * Math.PI / 4
            stripe.matrixAutoUpdate = false
            stripe.updateMatrix()
            this.container.add(stripe)
        }
    }

    // ── Helpers: physics + visual primitives ───────────────────────────────

    _addBlock(x, y, w, h, height, material)
    {
        const body = new CANNON.Body({ mass: 0, material: this.floorMat })
        body.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, height / 2)))
        body.position.set(x, y, height / 2)
        this.world.addBody(body)

        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(w, h, height),
            material,
        )
        mesh.position.set(x, y, height / 2)
        mesh.matrixAutoUpdate = false
        mesh.updateMatrix()
        this.container.add(mesh)
    }

    // Tilted slab. orient=0 → high end at +Y. orient rotates around Z.
    _addRamp(x, y, width, length, peak, orientationDeg, material)
    {
        const halfL = length / 2
        const halfW = width  / 2
        const halfT = RAMP_THICK / 2

        const tilt    = Math.atan2(peak, length)
        const z_center = peak - halfL * Math.sin(tilt) - halfT * Math.cos(tilt)

        const body = new CANNON.Body({ mass: 0, material: this.floorMat })
        body.addShape(new CANNON.Box(new CANNON.Vec3(halfW, halfL, halfT)))
        body.position.set(x, y, z_center)

        const qTilt   = new CANNON.Quaternion()
        qTilt.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), tilt)
        const qOrient = new CANNON.Quaternion()
        qOrient.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), orientationDeg * Math.PI / 180)
        body.quaternion = qOrient.mult(qTilt)
        this.world.addBody(body)

        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(width, length, RAMP_THICK),
            material,
        )
        mesh.position.set(x, y, z_center)
        mesh.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w)
        mesh.matrixAutoUpdate = false
        mesh.updateMatrix()
        this.container.add(mesh)
    }

    // Conical "pine tree" — cone on a cylinder trunk
    _addCone(x, y, scale = 1)
    {
        const trunkH = 0.8 * scale
        const trunkR = 0.35 * scale
        const coneH  = 3.6  * scale
        const coneR  = 1.1  * scale

        // Physics: single tall box approximating the silhouette
        const totalH = trunkH + coneH
        const body = new CANNON.Body({ mass: 0, material: this.floorMat })
        body.addShape(new CANNON.Box(new CANNON.Vec3(coneR * 0.6, coneR * 0.6, totalH / 2)))
        body.position.set(x, y, totalH / 2)
        this.world.addBody(body)

        // Trunk
        const trunkGeo  = new THREE.CylinderGeometry(trunkR, trunkR * 1.15, trunkH, 8)
        const trunkMesh = new THREE.Mesh(trunkGeo, this._matWall)
        trunkMesh.rotation.x = Math.PI / 2
        trunkMesh.position.set(x, y, trunkH / 2)
        trunkMesh.matrixAutoUpdate = false
        trunkMesh.updateMatrix()
        this.container.add(trunkMesh)

        // Cone foliage
        const coneGeo  = new THREE.ConeGeometry(coneR, coneH, 7)
        const coneMesh = new THREE.Mesh(coneGeo, this._matAccent)
        coneMesh.rotation.x = Math.PI / 2
        coneMesh.position.set(x, y, trunkH + coneH / 2)
        coneMesh.matrixAutoUpdate = false
        coneMesh.updateMatrix()
        this.container.add(coneMesh)
    }

    // Octahedron pylon — crystalline post
    _addOctahedronPost(x, y, height)
    {
        // Physics: thin tall box
        const body = new CANNON.Body({ mass: 0, material: this.floorMat })
        body.addShape(new CANNON.Box(new CANNON.Vec3(0.7, 0.7, height / 2)))
        body.position.set(x, y, height / 2)
        this.world.addBody(body)

        // Visual: stacked octahedrons
        const radius = 0.85
        const octGeo = new THREE.OctahedronGeometry(radius, 0)

        const lower = new THREE.Mesh(octGeo, this._matAccent)
        lower.position.set(x, y, radius)
        lower.matrixAutoUpdate = false
        lower.updateMatrix()
        this.container.add(lower)

        const upper = new THREE.Mesh(octGeo, this._matWall)
        upper.position.set(x, y, radius * 3 - 0.1)
        upper.scale.setScalar(0.75)
        upper.matrixAutoUpdate = false
        upper.updateMatrix()
        this.container.add(upper)
    }

    // Cylinder pylon — utility post / streetlight
    _addCylinderPost(x, y, height, radius)
    {
        const body = new CANNON.Body({ mass: 0, material: this.floorMat })
        body.addShape(new CANNON.Box(new CANNON.Vec3(radius, radius, height / 2)))
        body.position.set(x, y, height / 2)
        this.world.addBody(body)

        const trunkGeo = new THREE.CylinderGeometry(radius, radius * 1.15, height, 8)
        const trunk    = new THREE.Mesh(trunkGeo, this._matWall)
        trunk.rotation.x = Math.PI / 2
        trunk.position.set(x, y, height / 2)
        trunk.matrixAutoUpdate = false
        trunk.updateMatrix()
        this.container.add(trunk)

        // Crown — small accent icosahedron
        const crownGeo = new THREE.IcosahedronGeometry(0.7, 0)
        const crown    = new THREE.Mesh(crownGeo, this._matAccent)
        crown.position.set(x, y, height + 0.4)
        crown.matrixAutoUpdate = false
        crown.updateMatrix()
        this.container.add(crown)
    }
}
