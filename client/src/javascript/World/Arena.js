import * as THREE from 'three'
import CANNON from 'cannon'
import MatcapMaterial from '../Materials/Matcap.js'

// ── Layout constants ────────────────────────────────────────────────────────
const SIZE          = 90      // arena footprint (90×90m)
const WALL_HEIGHT   = 2.4
const WALL_THICK    = 1.0
const SURFACE_Z     = 0.012

const PLATEAU_SIZE   = 14
const PLATEAU_HEIGHT = 1.2
const RAMP_LENGTH    = 7
const RAMP_WIDTH     = 5
const RAMP_THICK     = 0.1

// 4 spawn slots clustered on the south side, away from the plateau
export const ARENA_SPAWN_GRID = [
    { x:  -6, y: -36 },
    { x:   6, y: -36 },
    { x: -18, y: -36 },
    { x:  18, y: -36 },
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

        // Track-shaped output for compatibility
        this.size       = SIZE
        this.spawnPos   = { x: 0, y: -36 }
        this.centerPath = []

        this._build()
    }

    // ── Material helpers ───────────────────────────────────────────────────
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

    // ── Build pipeline ─────────────────────────────────────────────────────
    _build()
    {
        this._createPerimeter()
        this._createPlateau()
        this._createRamps()
        this._createTrees()
        this._createCovers()
        this._createCrates()
        this._createMarkings()
    }

    _createPerimeter()
    {
        const half = SIZE / 2
        const t    = WALL_THICK
        const ext  = SIZE + t * 2

        const walls = [
            { x:  0,           y:  half + t/2, w: ext, h: t   },
            { x:  0,           y: -half - t/2, w: ext, h: t   },
            { x: -half - t/2,  y:  0,          w: t,   h: ext },
            { x:  half + t/2,  y:  0,          w: t,   h: ext },
        ]

        for(const w of walls)
            this._addBlock(w.x, w.y, w.w, w.h, WALL_HEIGHT, this._matWall)
    }

    // Central elevated plateau — drive up via ramps, snipe from above
    _createPlateau()
    {
        this._addBlock(0, 0, PLATEAU_SIZE, PLATEAU_SIZE, PLATEAU_HEIGHT, this._matAccent)

        // Decorative center marker (visible from below the plateau is solid red)
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

    _createRamps()
    {
        // 4 cardinal ramps leading up to the plateau edges (±7 from center).
        // Ramp center is offset by RAMP_LENGTH/2 outward from the plateau edge.
        const offset = PLATEAU_SIZE / 2 + RAMP_LENGTH / 2

        const ramps = [
            { x:  0,        y: -offset, orientation:    0 },   // south, ascends north
            { x:  0,        y:  offset, orientation:  180 },   // north, ascends south
            { x:  offset,   y:  0,      orientation:   90 },   // east,  ascends west
            { x: -offset,   y:  0,      orientation:  -90 },   // west,  ascends east
        ]

        for(const r of ramps)
            this._addRamp(r.x, r.y, RAMP_WIDTH, RAMP_LENGTH, PLATEAU_HEIGHT, r.orientation)
    }

    // Tall cylindrical posts scattered around — simulate trees / pylons
    _createTrees()
    {
        const positions = [
            // Mid-arena, breaking sightlines from the plateau
            [  20,  20], [ -20,  20], [  20, -20], [ -20, -20],
            // Outer ring — closer to the walls for cover-to-cover play
            [  35,   5], [ -35,   5], [  35,  -5], [ -35,  -5],
            [   5,  35], [  -5,  35], [   5, -35], [  -5, -35],
        ]
        for(const [x, y] of positions)
            this._addTree(x, y)
    }

    // L-shaped cover walls in the four mid-zone quadrants
    _createCovers()
    {
        const covers = [
            // NE
            { x:  26, y:  14, w: 8,   h: 1.2, height: 2.0 },
            { x:  21, y:  19, w: 1.2, h: 6,   height: 2.0 },
            // NW
            { x: -26, y:  14, w: 8,   h: 1.2, height: 2.0 },
            { x: -21, y:  19, w: 1.2, h: 6,   height: 2.0 },
            // SE
            { x:  26, y: -14, w: 8,   h: 1.2, height: 2.0 },
            { x:  21, y: -19, w: 1.2, h: 6,   height: 2.0 },
            // SW
            { x: -26, y: -14, w: 8,   h: 1.2, height: 2.0 },
            { x: -21, y: -19, w: 1.2, h: 6,   height: 2.0 },
        ]
        for(const c of covers)
            this._addBlock(c.x, c.y, c.w, c.h, c.height, this._matWall)
    }

    // Small accent crates near the spawn corridor
    _createCrates()
    {
        const crates = [
            { x: -12, y: -22, w: 2, h: 2, height: 1.4 },
            { x:  12, y: -22, w: 2, h: 2, height: 1.4 },
            { x:   0, y: -28, w: 3, h: 2, height: 1.4 },
            { x: -28, y:   0, w: 2, h: 3, height: 1.4 },
            { x:  28, y:   0, w: 2, h: 3, height: 1.4 },
            { x:   0, y:  28, w: 3, h: 2, height: 1.4 },
        ]
        for(const c of crates)
            this._addBlock(c.x, c.y, c.w, c.h, c.height, this._matAccent)
    }

    // Floor decorations — caution stripes near the corners + ring around plateau
    _createMarkings()
    {
        // Caution stripes at the corners
        const stripeGeo = new THREE.PlaneGeometry(14, 1.6)
        const stripeMat = new THREE.MeshBasicMaterial({
            color: 0xffb627, transparent: true, opacity: 0.18,
        })
        const corner = SIZE / 2 - 6
        for(const sx of [-1, 1])
        {
            for(const sy of [-1, 1])
            {
                const stripe = new THREE.Mesh(stripeGeo, stripeMat)
                stripe.position.set(sx * corner, sy * corner, SURFACE_Z)
                stripe.rotation.z = sx * sy * Math.PI / 4
                stripe.matrixAutoUpdate = false
                stripe.updateMatrix()
                this.container.add(stripe)
            }
        }

        // Hex ring around the plateau on the floor
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
    }

    // ── Helpers: physics + visual geometry ─────────────────────────────────

    _addBlock(x, y, w, h, height, material)
    {
        const halfExtents = new CANNON.Vec3(w / 2, h / 2, height / 2)
        const body = new CANNON.Body({ mass: 0, material: this.floorMat })
        body.addShape(new CANNON.Box(halfExtents))
        body.position.set(x, y, height / 2)
        this.world.addBody(body)

        const geo  = new THREE.BoxGeometry(w, h, height)
        const mesh = new THREE.Mesh(geo, material)
        mesh.position.set(x, y, height / 2)
        mesh.matrixAutoUpdate = false
        mesh.updateMatrix()
        this.container.add(mesh)
    }

    // Tilted slab — high end at z=peak when oriented along default +Y
    _addRamp(x, y, width, length, peak, orientationDeg)
    {
        const halfL = length / 2
        const halfW = width  / 2
        const halfT = RAMP_THICK / 2

        const tilt  = Math.atan2(peak, length)

        // Position so the ramp's high SURFACE corner aligns with z=peak
        const z_center = peak - halfL * Math.sin(tilt) - halfT * Math.cos(tilt)

        // Cannon body — combine tilt around X with orient around Z
        const body = new CANNON.Body({ mass: 0, material: this.floorMat })
        body.addShape(new CANNON.Box(new CANNON.Vec3(halfW, halfL, halfT)))
        body.position.set(x, y, z_center)

        const qTilt   = new CANNON.Quaternion()
        qTilt.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), tilt)
        const qOrient = new CANNON.Quaternion()
        qOrient.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), orientationDeg * Math.PI / 180)
        body.quaternion = qOrient.mult(qTilt)

        this.world.addBody(body)

        // Three.js mesh — copy the same world rotation
        const geo  = new THREE.BoxGeometry(width, length, RAMP_THICK)
        const mesh = new THREE.Mesh(geo, this._matAccent)
        mesh.position.set(x, y, z_center)
        mesh.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w)
        mesh.matrixAutoUpdate = false
        mesh.updateMatrix()
        this.container.add(mesh)
    }

    // Vertical "tree" / pylon — thin tall prism
    _addTree(x, y)
    {
        const trunkH = 4.0
        const trunkR = 0.55
        const segments = 8

        // Cannon — square cross-section box approximates the cylinder for collision
        const body = new CANNON.Body({ mass: 0, material: this.floorMat })
        body.addShape(new CANNON.Box(new CANNON.Vec3(trunkR, trunkR, trunkH / 2)))
        body.position.set(x, y, trunkH / 2)
        this.world.addBody(body)

        // Visual: cylinder for the trunk, sphere on top for the canopy
        const trunkGeo = new THREE.CylinderGeometry(trunkR, trunkR * 1.1, trunkH, segments)
        const trunk    = new THREE.Mesh(trunkGeo, this._matWall)
        trunk.rotation.x = Math.PI / 2     // align with world Z (cylinder is along Y by default)
        trunk.position.set(x, y, trunkH / 2)
        trunk.matrixAutoUpdate = false
        trunk.updateMatrix()
        this.container.add(trunk)

        // Canopy — a low-poly icosphere caps the trunk
        const canopyGeo = new THREE.IcosahedronGeometry(1.1, 0)
        const canopy    = new THREE.Mesh(canopyGeo, this._matAccent)
        canopy.position.set(x, y, trunkH + 0.4)
        canopy.matrixAutoUpdate = false
        canopy.updateMatrix()
        this.container.add(canopy)
    }
}
