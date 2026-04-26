import * as THREE from 'three'
import CANNON from 'cannon'
import MatcapMaterial from '../Materials/Matcap.js'

// ── Layout constants ────────────────────────────────────────────────────────
const SIZE        = 80      // arena is 80×80m
const WALL_HEIGHT = 1.8
const WALL_THICK  = 1.0
const SURFACE_Z   = 0.012   // just above floor (paint markings)

// Obstacle layout — relative to arena center (0,0).
// Mix of square cover (4×4) and longer barriers (10×2) creating loose lanes
// without forcing a single path.
const OBSTACLES = [
    // Inner ring — small cover near center for ambushes
    { x:   8, y:   8, w:  4, h:  4, height: 2.0, accent: true  },
    { x:  -8, y:   8, w:  4, h:  4, height: 2.0, accent: true  },
    { x:   8, y:  -8, w:  4, h:  4, height: 2.0, accent: true  },
    { x:  -8, y:  -8, w:  4, h:  4, height: 2.0, accent: true  },

    // Outer ring — larger cover near the walls
    { x:  24, y:  24, w:  6, h:  6, height: 2.6, accent: false },
    { x: -24, y:  24, w:  6, h:  6, height: 2.6, accent: false },
    { x:  24, y: -24, w:  6, h:  6, height: 2.6, accent: false },
    { x: -24, y: -24, w:  6, h:  6, height: 2.6, accent: false },

    // Mid bars — long barriers that break sightlines and create flanks
    { x:   0, y:  18, w: 14, h:  2, height: 2.0, accent: false },
    { x:   0, y: -18, w: 14, h:  2, height: 2.0, accent: false },
    { x:  18, y:   0, w:  2, h: 14, height: 2.0, accent: false },
    { x: -18, y:   0, w:  2, h: 14, height: 2.0, accent: false },
]

// 4 spawn points at the south side of the arena, facing north (+Y)
export const ARENA_SPAWN_GRID = [
    { x:  -6, y: -32 },
    { x:   6, y: -32 },
    { x: -18, y: -32 },
    { x:  18, y: -32 },
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

        this._matWall   = this._makeMatcap('matcapWhiteTexture')
        this._matAccent = this._makeMatcap('matcapRedTexture')

        // Compatibility with code that expects Track-shaped output
        this.size       = SIZE
        this.spawnPos   = { x: 0, y: -32 }
        this.centerPath = []        // no race line

        this._build()
    }

    // ── matcap helper ──────────────────────────────────────────────────────
    _makeMatcap(texName)
    {
        const mat = MatcapMaterial()
        mat.uniforms.matcap.value = this.resources.items[texName]
            || this.resources.items.matcapWhiteTexture
        for(const [k, v] of Object.entries(SHADE_UNIFORMS))
            mat.uniforms[k].value = v
        return mat
    }

    // ── Build pipeline ─────────────────────────────────────────────────────
    _build()
    {
        this._createPerimeter()
        this._createObstacles()
        this._createMarkings()
    }

    // 4 perimeter walls forming a square around the arena
    _createPerimeter()
    {
        const half = SIZE / 2
        const t    = WALL_THICK
        const ext  = SIZE + t * 2     // make corners overlap so no seam

        const walls = [
            { x:  0,           y:  half + t/2, w: ext, h: t   },  // north
            { x:  0,           y: -half - t/2, w: ext, h: t   },  // south
            { x: -half - t/2,  y:  0,          w: t,   h: ext },  // west
            { x:  half + t/2,  y:  0,          w: t,   h: ext },  // east
        ]

        for(const w of walls)
        {
            this._addBlock(w.x, w.y, w.w, w.h, WALL_HEIGHT, this._matWall)
        }
    }

    _createObstacles()
    {
        for(const o of OBSTACLES)
        {
            const mat = o.accent ? this._matAccent : this._matWall
            this._addBlock(o.x, o.y, o.w, o.h, o.height, mat)
        }
    }

    // Floor markings — a faint hexagon and corner triangles for arena identity
    _createMarkings()
    {
        // Center chevron ring (decorative, no physics)
        const ringGeo = new THREE.RingGeometry(8.5, 9.0, 64)
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xff2e4d,
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide,
        })
        const ring = new THREE.Mesh(ringGeo, ringMat)
        ring.position.z = SURFACE_Z
        ring.matrixAutoUpdate = false
        ring.updateMatrix()
        this.container.add(ring)

        // Inner danger zone marker
        const innerGeo = new THREE.RingGeometry(0, 1.2, 32)
        const innerMat = new THREE.MeshBasicMaterial({
            color: 0xff2e4d,
            transparent: true,
            opacity: 0.55,
            side: THREE.DoubleSide,
        })
        const inner = new THREE.Mesh(innerGeo, innerMat)
        inner.position.z = SURFACE_Z + 0.001
        inner.matrixAutoUpdate = false
        inner.updateMatrix()
        this.container.add(inner)

        // Corner caution stripes (4 corners)
        const stripeGeo = new THREE.PlaneGeometry(12, 1.6)
        const stripeMat = new THREE.MeshBasicMaterial({
            color: 0xffb627,
            transparent: true,
            opacity: 0.22,
        })
        const half = SIZE / 2 - 4
        for(const sign of [-1, 1])
        {
            for(const sign2 of [-1, 1])
            {
                const stripe = new THREE.Mesh(stripeGeo, stripeMat)
                stripe.position.set(sign * half, sign2 * half, SURFACE_Z)
                stripe.rotation.z = sign * sign2 * Math.PI / 4
                stripe.matrixAutoUpdate = false
                stripe.updateMatrix()
                this.container.add(stripe)
            }
        }
    }

    // ── Helper: add a static physics block + matching mesh ─────────────────
    _addBlock(x, y, w, h, height, material)
    {
        // Cannon body — static (mass 0)
        const halfExtents = new CANNON.Vec3(w / 2, h / 2, height / 2)
        const shape = new CANNON.Box(halfExtents)
        const body  = new CANNON.Body({
            mass:     0,
            material: this.floorMat,
        })
        body.addShape(shape)
        body.position.set(x, y, height / 2)
        this.world.addBody(body)

        // Three.js mesh
        const geo  = new THREE.BoxGeometry(w, h, height)
        const mesh = new THREE.Mesh(geo, material)
        mesh.position.set(x, y, height / 2)
        mesh.matrixAutoUpdate = false
        mesh.updateMatrix()
        this.container.add(mesh)
    }
}
